const { ChannelType } = require('discord.js');
const storage = require('./storage');
const { randomEmoji } = require('./emojiPalette');
const { applyEmojiToMember, removeEmojiFromMember, stripEmojiPrefixes } = require('./nickname');
const { buildPanelEmbed, buildPanelComponents, buildPanelAttachments } = require('./panelView');
const { buildGamePanelEmbed, buildGamePanelComponents } = require('./gamePanelView');
const { refreshDashboard } = require('./dashboard');

const pendingDeletions = new Set(); // channelIds with a delete check already queued

// Members the bot server-muted through a game room's "Mute All" are tracked in
// storage (so it survives restarts). Discord only lets the bot change someone's
// voice state while they're connected, so a member who leaves a muted room keeps
// the server mute until they join a voice channel again. Keys are "guildId:userId".
function victimKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

// Emoji used on every game channel's name — fixed, not per-user, since game
// channels aren't tied to a synced nickname emoji the way regular temp
// channels are.
const GAME_CHANNEL_EMOJI = '🎮';

// Fixed (non-temp) voice channels that should still sync their emoji onto
// anyone sitting in them, same as temp channels do — just for these two
// specific static channels rather than every generated temp channel.
const STATIC_EMOJI_SYNC_CHANNEL_IDS = new Set([
  '1517940974125318166',
  '1517941337700176003',
  '1543001094781665370',
  '1513904253423587451',
  '1519068432316760286',
  '1543346189276160241',
]);

// Grabs whatever emoji the channel's own name starts with, so renaming the
// channel automatically changes what gets applied — no separate config to
// keep in sync. No trailing-space requirement here (channel names often
// don't have one), unlike the nickname-prefix matcher in nickname.js.
const LEADING_EMOJI_RE = /^\p{Extended_Pictographic}\uFE0F?/u;
function getChannelLeadingEmoji(channel) {
  const match = channel?.name?.match(LEADING_EMOJI_RE);
  return match ? match[0] : null;
}

// Discord's channel-name validation rejects a few things that easily slip
// into a name built from someone's raw display name: repeated whitespace,
// leading/trailing whitespace, and it enforces a 100-character cap. This
// keeps the generated name inside those rules instead of finding out via a
// failed API call.
function sanitizeChannelName(name) {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

// Converts A-Z/a-z into Mathematical Bold Italic Sans-Serif unicode
// characters (𝘁𝗵𝗶𝘀 𝘁𝗲𝘅𝘁 𝘀𝘁𝘆𝗹𝗲). Numbers, spaces, and symbols (★, emoji)
// are left untouched since that unicode block has no digit/symbol variants.
function toStyledText(text) {
  const upperBase = 0x1d468; // bold italic sans A
  const lowerBase = 0x1d482; // bold italic sans a
  return text
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(upperBase + (code - 65));
      if (code >= 97 && code <= 122) return String.fromCodePoint(lowerBase + (code - 97));
      return ch;
    })
    .join('');
}

// Extra permissions the channel owner gets on their own channel, on top of
// whatever the panel buttons already let them do.
//
// ViewChannel/SendMessages/ReadMessageHistory/Speak are explicit here (not
// just Connect) because the bot moves the owner into the channel directly
// via member.voice.setChannel(), which bypasses permission checks.
const OWNER_CHANNEL_PERMISSIONS = {
  ViewChannel: true,
  Connect: true,
  Speak: true,
  SendMessages: true,
  ReadMessageHistory: true,
};

async function updateOwnerPermissions(channel, oldOwnerId, newOwnerId) {
  try {
    if (oldOwnerId && oldOwnerId !== newOwnerId) {
      await channel.permissionOverwrites.delete(oldOwnerId).catch(() => {});
    }
    if (newOwnerId) {
      await channel.permissionOverwrites.edit(newOwnerId, OWNER_CHANNEL_PERMISSIONS);
    }
  } catch (err) {
    console.warn(`[permissions] could not update owner overwrite: ${err.message}`);
  }
}

// Copies the category's permission overwrites onto a new channel, so a new
// temp/game channel looks the same to members as the rest of the category.
async function syncToCategoryPermissions(channel) {
  try {
    await channel.lockPermissions();
  } catch (err) {
    console.warn(`[permissions] could not sync ${channel.name} to its category's permissions: ${err.message}`);
  }
}

// Optional: a specific role locked out of every temp/game channel. Set
// config.blockedRoleId to turn this on. Applied before the owner's own
// overwrite, so it can never lock the owner out of their own channel.
async function denyBlockedRole(channel, config) {
  if (!config.blockedRoleId) return;
  try {
    await channel.permissionOverwrites.edit(config.blockedRoleId, {
      ViewChannel: false,
      Connect: false,
      SendMessages: false,
    });
  } catch (err) {
    console.warn(`[permissions] could not apply blockedRoleId overwrite on ${channel.name}: ${err.message}`);
  }
}

// Saves the channel's current name/limit/locked/trusted state under its
// owner, so the next channel that owner creates can start off the same way.
// Game channels are session-based, so they're skipped.
function snapshotOwnerSettings(tempData) {
  if (!tempData || !tempData.ownerId) return;
  if (tempData.type === 'game') return;
  storage.setUserSettings(tempData.ownerId, {
    customName: tempData.customName || null,
    limit: tempData.limit || 0,
    locked: !!tempData.locked,
    trusted: tempData.trusted || [],
    cleanupIntervalMinutes:
      typeof tempData.cleanupIntervalMinutes === 'number' ? tempData.cleanupIntervalMinutes : 10,
  });
}

// The one place a temp channel actually gets deleted.
async function destroyTempChannel(guild, channel, channelId, tempData) {
  snapshotOwnerSettings(tempData);
  storage.deleteTempChannel(channelId);
  if (channel) {
    await channel.delete().catch(() => {});
  }
  await refreshDashboard(guild).catch(() => {});
}

// Re-renders the regular temp-channel panel in place after a setting changes.
// Only treats the panel as gone when Discord says it's missing; other errors
// used to cause a duplicate panel, so they're logged and skipped instead.
async function refreshPanelMessage(channel, tempData) {
  if (!tempData || !tempData.panelMessageId) return;
  try {
    const ownerMember = await channel.guild.members.fetch(tempData.ownerId).catch(() => null);
    const ownerPresent = channel.members.has(tempData.ownerId);

    let message = null;
    let panelGone = false;
    try {
      message = await channel.messages.fetch(tempData.panelMessageId);
    } catch (err) {
      if (err.code === 10008) {
        panelGone = true;
      } else {
        console.warn(`[tempvc] could not fetch panel message in ${channel.name}: ${err.message}`);
        return;
      }
    }

    if (panelGone) {
      console.warn(`[tempvc] panel message missing in ${channel.name} — reposting a new one`);
      try {
        const fresh = await channel.send({
          embeds: [buildPanelEmbed(ownerMember, tempData)],
          components: buildPanelComponents(ownerPresent, !!tempData.locked),
          files: buildPanelAttachments(),
        });
        tempData.panelMessageId = fresh.id;
        storage.setTempChannel(channel.id, tempData);
      } catch (err) {
        console.warn(`[tempvc] could not repost missing panel in ${channel.name}: ${err.message}`);
      }
      return;
    }

    await message.edit({
      embeds: [buildPanelEmbed(ownerMember, tempData)],
      components: buildPanelComponents(ownerPresent, !!tempData.locked),
      files: buildPanelAttachments(),
    });
  } catch (err) {
    console.warn(`[tempvc] could not refresh panel message: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Game room mute
// ---------------------------------------------------------------------------

// Server-mutes (or unmutes) everyone in a game room except the owner and bots.
// Members already in the requested state are skipped, so repeated presses do
// no extra API work. Runs in parallel; callers don't need to wait for it.
async function setRoomMute(channel, tempData, shouldMute) {
  const guildId = channel.guild.id;

  if (!shouldMute) {
    storage.removeMutedVictims([...channel.members.keys()].map((id) => victimKey(guildId, id)));
  }

  const targets = channel.members.filter(
    (m) => !m.user.bot && m.id !== tempData.ownerId && m.voice.serverMute !== shouldMute
  );
  if (shouldMute) {
    storage.addMutedVictims([...targets.keys()].map((id) => victimKey(guildId, id)));
  }

  const results = await Promise.allSettled([...targets.values()].map((m) => m.voice.setMute(shouldMute)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const m = [...targets.values()][i];
      console.warn(`[gamevc] could not ${shouldMute ? 'mute' : 'unmute'} ${m.user.tag}: ${r.reason?.message}`);
    }
  });
  return results.length;
}

// Runs on every join, and decides the member's server mute from the room they
// just landed in, not from where they came from:
//   - joins a game room with Mute All on (and isn't its owner) -> muted
//   - joins anywhere else and the bot had muted them earlier   -> unmuted
// So rejoining a muted room stays muted, and moving to a room without Mute All
// lifts the mute right away.
async function syncMemberMute(newState) {
  const member = newState.member;
  if (!member || member.user.bot || !newState.channelId) return;
  const key = victimKey(newState.guild.id, member.id);
  const destTempData = storage.getTempChannel(newState.channelId);

  const shouldBeMuted =
    !!destTempData &&
    destTempData.type === 'game' &&
    !!destTempData.mutedAll &&
    member.id !== destTempData.ownerId;

  if (shouldBeMuted) {
    storage.addMutedVictims([key]);
    if (!newState.serverMute) await newState.setMute(true).catch(() => {});
    return;
  }

  if (storage.hasMutedVictim(key)) {
    storage.removeMutedVictims([key]);
    if (newState.serverMute) await newState.setMute(false).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Temp channel creation and cleanup
// ---------------------------------------------------------------------------

// True once no real person is left in the channel (bots don't count).
function hasNoHumans(channel) {
  return !channel.members.some((m) => !m.user.bot);
}

async function createTempChannel(member, guild, config) {
  const emoji = storage.getUserEmoji(member.id) || randomEmoji();
  const saved = storage.getUserSettings(member.id);
  // Strip any stuck emoji prefix so it can't leak into the channel name.
  const cleanDisplayName = stripEmojiPrefixes(member.displayName);
  const baseName = (saved && saved.customName) || `${cleanDisplayName}'s Channel`;
  const channelName = sanitizeChannelName(`${emoji} ${baseName}`);

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: config.categoryId || null,
      userLimit: (saved && saved.limit) || 0,
    });
  } catch (err) {
    console.warn(`[tempvc] rejected name "${channelName}" (${err.message}) — retrying with a plain fallback name`);
    try {
      channel = await guild.channels.create({
        name: `${emoji} Channel`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: config.categoryId || null,
        userLimit: (saved && saved.limit) || 0,
      });
    } catch (err2) {
      console.error(`[tempvc] could not create a temp channel for ${member.user.tag} even with a fallback name: ${err2.message}`);
      return;
    }
  }

  const tempDataRecord = {
    guildId: guild.id,
    ownerId: member.id,
    emoji,
    customName: (saved && saved.customName) || null,
    limit: (saved && saved.limit) || 0,
    locked: !!(saved && saved.locked),
    trusted: (saved && saved.trusted) || [],
    cleanupIntervalMinutes:
      saved && typeof saved.cleanupIntervalMinutes === 'number' ? saved.cleanupIntervalMinutes : 10,
    lastPurgeAt: Date.now(),
    createdAt: Date.now(),
  };
  storage.setTempChannel(channel.id, tempDataRecord);

  // Order matters: category sync, force ViewChannel, blocked-role deny, then
  // the owner's own overwrite last so the owner always wins.
  await syncToCategoryPermissions(channel);
  await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true }).catch((err) => {
    console.warn(`[permissions] could not force ViewChannel on ${channel.name}: ${err.message}`);
  });
  await denyBlockedRole(channel, config);
  await updateOwnerPermissions(channel, null, member.id);

  if (saved && saved.locked) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false }).catch(() => {});
  }
  if (saved && saved.trusted && saved.trusted.length) {
    await Promise.all(
      saved.trusted.map((userId) =>
        channel.permissionOverwrites.edit(userId, { Connect: true }).catch(() => {})
      )
    );
  }

  try {
    const panelMessage = await channel.send({
      embeds: [buildPanelEmbed(member, tempDataRecord)],
      components: buildPanelComponents(),
      files: buildPanelAttachments(),
    });
    tempDataRecord.panelMessageId = panelMessage.id;
    storage.setTempChannel(channel.id, tempDataRecord);
  } catch (err) {
    console.warn(`[tempvc] could not post the panel in ${channel.name}: ${err.message}`);
  }

  try {
    await member.voice.setChannel(channel);
  } catch (err) {
    console.warn(`[tempvc] could not move ${member.user.tag} into their new channel: ${err.message}`);
    await channel.delete().catch(() => {});
    storage.deleteTempChannel(channel.id);
  }

  await refreshDashboard(guild).catch(() => {});
}

// Same shape as createTempChannel, for the game join-to-create channel.
async function createGameChannel(member, guild, config) {
  const channelName = sanitizeChannelName(`${GAME_CHANNEL_EMOJI} ${toStyledText('Game')}`);

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: config.gameCategoryId || null,
    });
  } catch (err) {
    console.error(`[gamevc] could not create a game channel for ${member.user.tag}: ${err.message}`);
    return;
  }

  const tempDataRecord = {
    guildId: guild.id,
    ownerId: member.id,
    type: 'game',
    emoji: GAME_CHANNEL_EMOJI,
    game: null,
    gameEmoji: null,
    mutedAll: false,
    createdAt: Date.now(),
  };
  storage.setTempChannel(channel.id, tempDataRecord);

  await syncToCategoryPermissions(channel);
  await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true }).catch((err) => {
    console.warn(`[permissions] could not force ViewChannel on ${channel.name}: ${err.message}`);
  });
  await denyBlockedRole(channel, config);
  await updateOwnerPermissions(channel, null, member.id);

  try {
    const panelMessage = await channel.send({
      content: `<@${member.id}>`,
      embeds: [buildGamePanelEmbed(member, tempDataRecord)],
      components: buildGamePanelComponents(tempDataRecord),
    });
    tempDataRecord.panelMessageId = panelMessage.id;
    storage.setTempChannel(channel.id, tempDataRecord);
  } catch (err) {
    console.warn(`[gamevc] could not post the game panel in ${channel.name}: ${err.message}`);
  }

  try {
    await member.voice.setChannel(channel);
  } catch (err) {
    console.warn(`[gamevc] could not move ${member.user.tag} into their new game channel: ${err.message}`);
    await channel.delete().catch(() => {});
    storage.deleteTempChannel(channel.id);
    return;
  }

  await refreshDashboard(guild).catch(() => {});
}

// Renames a game channel to match the picked game, optionally moves it into
// that game's category, and records both in storage. Returns false if Discord
// rejected the rename (its limit is two renames per 10 minutes).
async function setChannelGame(channel, tempData, channelId, gameName, emoji, categoryId) {
  const finalName = sanitizeChannelName(toStyledText(gameName));
  let renamed = true;
  try {
    await channel.setName(finalName);
  } catch (err) {
    renamed = false;
    console.warn(`[gamevc] could not rename channel to "${finalName}": ${err.message}`);
  }

  if (categoryId && channel.parentId !== categoryId) {
    try {
      await channel.setParent(categoryId, { lockPermissions: false });
    } catch (err) {
      console.warn(`[gamevc] could not move channel to category ${categoryId}: ${err.message}`);
    }
  }

  tempData.game = gameName;
  tempData.gameEmoji = emoji;
  tempData.gameSetAt = Date.now();
  storage.setTempChannel(channelId, tempData);
  return renamed;
}

// Regular temp channels sync the owner's emoji onto nicknames. Game rooms
// get Mute All handling instead: a member joining a room that's already
// muted-all is muted straight away.
async function onJoinTracked(member, tempData) {
  if (tempData.type === 'game') return; // mute is handled by syncMemberMute
  await applyEmojiToMember(member, tempData.emoji);
}

async function onLeaveTracked(member, channelId, guild, tempData) {
  if (!tempData || tempData.type !== 'game') {
    await removeEmojiFromMember(member);
  }
  scheduleEmptyCheck(channelId, guild);
}

// Checks (and deletes) an empty channel as soon as the current event-loop
// tick clears, so an in-flight voice update gets applied first.
function scheduleEmptyCheck(channelId, guild) {
  if (pendingDeletions.has(channelId)) return;
  pendingDeletions.add(channelId);
  setImmediate(async () => {
    pendingDeletions.delete(channelId);
    const tempData = storage.getTempChannel(channelId);
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      snapshotOwnerSettings(tempData);
      storage.deleteTempChannel(channelId);
      await refreshDashboard(guild).catch(() => {});
      return;
    }
    if (hasNoHumans(channel)) {
      await destroyTempChannel(guild, channel, channelId, tempData);
    }
  });
}

async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  const joinedStaticChannel = newChannelId && STATIC_EMOJI_SYNC_CHANNEL_IDS.has(newChannelId);
  const leftStaticChannel = oldChannelId && STATIC_EMOJI_SYNC_CHANNEL_IDS.has(oldChannelId);

  const config = storage.getGuildConfig(guild.id);
  const oldTempData = oldChannelId ? storage.getTempChannel(oldChannelId) : null;

  // Leave cleanup first, then the destination. Doing this in the opposite
  // order let a temp channel's leave-cleanup strip an emoji that had just
  // been applied by joining a static channel.
  if (oldTempData) {
    await onLeaveTracked(member, oldChannelId, guild, oldTempData);
  } else if (leftStaticChannel && !joinedStaticChannel) {
    await removeEmojiFromMember(member);
  }

  // Mute state follows the room they joined. Runs before the rest of the join
  // logic so the mute is correct from the moment they're in the channel.
  if (newChannelId) {
    await syncMemberMute(newState);
  }

  if (joinedStaticChannel) {
    const channel = guild.channels.cache.get(newChannelId);
    const emoji = getChannelLeadingEmoji(channel);
    if (emoji) await applyEmojiToMember(member, emoji);
  }

  if (!config) return;

  if (newChannelId === config.joinToCreateId) {
    await createTempChannel(member, guild, config);
    return;
  }

  if (newChannelId === config.gameJoinToCreateId) {
    await createGameChannel(member, guild, config);
    return;
  }

  if (newChannelId) {
    const newTempData = storage.getTempChannel(newChannelId);
    if (newTempData) {
      await onJoinTracked(member, newTempData);
    }
  }
}

// Deletes any tracked channel that's empty right now.
async function sweepEmptyChannels(client) {
  const all = storage.getAllTempChannels();
  for (const channelId of Object.keys(all)) {
    const data = all[channelId];
    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      snapshotOwnerSettings(data);
      storage.deleteTempChannel(channelId);
      await refreshDashboard(guild).catch(() => {});
      continue;
    }
    if (channel.members.size === 0) {
      await destroyTempChannel(guild, channel, channelId, data);
    }
  }
}

async function reconcileOnStartup(client) {
  await sweepEmptyChannels(client);
  startPeriodicCleanup(client);
}

// Wipes every message in a temp channel's text chat except the panel itself.
async function purgeChannelMessages(channel, tempData) {
  if (!tempData || !tempData.panelMessageId) {
    console.warn(`[cleanup] skipping ${channel.name} — no known panel message id`);
    return;
  }
  try {
    let totalDeleted = 0;
    while (true) {
      const messages = await channel.messages.fetch({ limit: 100 });
      const toDelete = messages.filter((m) => m.id !== tempData.panelMessageId);
      if (toDelete.size === 0) break;

      if (toDelete.size === 1) {
        await toDelete.first().delete().catch(() => {});
        totalDeleted += 1;
      } else {
        // bulkDelete(…, true) silently skips messages older than 14 days.
        const deleted = await channel.bulkDelete(toDelete, true).catch((err) => {
          console.warn(`[cleanup] bulkDelete failed in ${channel.name}: ${err.message}`);
          return null;
        });
        if (!deleted) break;
        totalDeleted += deleted.size;
        if (deleted.size === 0) break;
      }

      if (messages.size < 100) break;
    }
    if (totalDeleted > 0) {
      console.log(`[cleanup] deleted ${totalDeleted} message(s) in ${channel.name}`);
    }
  } catch (err) {
    console.warn(`[cleanup] could not purge messages in ${channel.name}: ${err.message}`);
  }
}

async function purgeAllTempChannels(client) {
  const all = storage.getAllTempChannels();
  const now = Date.now();
  for (const channelId of Object.keys(all)) {
    const data = all[channelId];
    const intervalMinutes = data.cleanupIntervalMinutes;
    if (!intervalMinutes) continue;

    const dueAt = (data.lastPurgeAt || data.createdAt || 0) + intervalMinutes * 60 * 1000;
    if (now < dueAt) continue;

    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;

    await purgeChannelMessages(channel, data);
    data.lastPurgeAt = now;
    storage.setTempChannel(channelId, data);
    await refreshPanelMessage(channel, data);
  }
}

const CLEANUP_CHECK_INTERVAL_MS = 60 * 1000;
let cleanupIntervalStarted = false;

function startPeriodicCleanup(client) {
  if (cleanupIntervalStarted) return;
  cleanupIntervalStarted = true;
  setInterval(() => {
    purgeAllTempChannels(client).catch((err) => console.warn(`[cleanup] sweep failed: ${err.message}`));
  }, CLEANUP_CHECK_INTERVAL_MS);
  console.log('[cleanup] Periodic message cleanup started — checking every minute against each channel\'s own timer.');
}

module.exports = {
  handleVoiceStateUpdate,
  sweepEmptyChannels,
  reconcileOnStartup,
  updateOwnerPermissions,
  destroyTempChannel,
  refreshPanelMessage,
  snapshotOwnerSettings,
  setChannelGame,
  toStyledText,
  setRoomMute,
};

// ============================================================================
// BOT BOOTSTRAP — this is what actually starts the bot.
// This section requires interactionHandler.js and gameInteractionHandler.js,
// which require this file. That circular require is safe because it sits
// below module.exports, so the other files get the real functions.
// ============================================================================

const { Client, GatewayIntentBits } = require('discord.js');
const { handleInteraction } = require('./interactionHandler');
const { handleGameInteraction } = require('./gameInteractionHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Seeded every startup because storage resets on redeploy.
  if (process.env.GUILD_ID) {
    storage.setGuildConfig(process.env.GUILD_ID, {
      gameJoinToCreateId: '1553121517879951480',
      gameCategoryId: '1513904233471283252',
      dashboardChannelId: '1553107162929037442',
      gameAnnounceChannelId: '1513904271337197741',
    });
    console.log('[startup] game join-to-create channel and category configured.');
  } else {
    console.warn('[startup] GUILD_ID env var is missing — game channel creation will not trigger.');
  }

  await reconcileOnStartup(client);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState).catch((err) =>
    console.error('[voiceStateUpdate] unhandled error:', err)
  );
});

client.on('interactionCreate', async (interaction) => {
  try {
    await handleInteraction(interaction);
    await handleGameInteraction(interaction);
  } catch (err) {
    console.error('[interactionCreate] unhandled error:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
