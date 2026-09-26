// gameInteractionHandler.js
// Handles every click/submit on the GAME panel (from gamePanelView.js):
// picking a listed game (some of which pop up a modal immediately), picking
// "Others", and setting/editing a party code or game name after the fact.
//
// HOW TO WIRE THIS UP: in your main bot file, alongside the regular panel
// handler:
//
//   const { handleGameInteraction } = require('./gameInteractionHandler');
//   client.on('interactionCreate', handleGameInteraction);
//
// (You can have both handleInteraction and handleGameInteraction registered
// on interactionCreate at the same time — each one just ignores customIds
// that aren't its own and returns early.)

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const storage = require('./storage');
const { setChannelGame } = require('./voiceManager');
const {
  GAME_LIST,
  getGameByKey,
  getPromptType,
  buildGamePanelEmbed,
  buildGamePanelComponents,
  buildGameRoomControlsEmbed,
  buildGameRoomControlsComponents,
  buildOtherGameModal,
  buildPartyCodeModal,
  buildGameNameModal,
} = require('./gamePanelView');

function sanitize(name) {
  return name.replace(/\s+/g, ' ').trim().slice(0, 50);
}

const ANNOUNCE_COLOR = 0x8b5cf6; // same violet accent as the panels

// Small embed posted to the announcements channel — avatar, game, and a
// direct link to the room, instead of a single line of plain text.
function buildAnnounceEmbed(member, channel, gameLabel, gameEmoji) {
  return new EmbedBuilder()
    .setColor(ANNOUNCE_COLOR)
    .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() })
    .setTitle(`${gameEmoji || '🎮'} Looking for teammates`)
    .setDescription(
      `**${member.displayName}** just started a **${gameLabel}** room and is looking for people to join!`
    )
    .addFields({ name: 'Channel', value: `<#${channel.id}>`, inline: true })
    .setTimestamp();
}

// A single button under the announcement. Clicking it tries to move the
// clicker straight into the game voice channel — Discord only lets a bot
// move someone who's already connected to *some* voice channel, so the
// handler below falls back to a friendly nudge if they aren't.
function buildAnnounceComponents(channel) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_announce_join_${channel.id}`)
        .setLabel('Join Channel')
        .setEmoji('🔊')
        .setStyle(ButtonStyle.Success)
    ),
  ];
}

// Whenever a game gets picked: post a heads-up embed in the fixed
// game-announcements channel (config.gameAnnounceChannelId), with a Join
// Channel button, and — if this game has a role configured in
// config.gameRoleIds — a ping for that role right in the same message.
// Games with no configured role just get the embed with no mention at all.
//
// The sent message's id (and which channel it landed in) is stored on
// tempData so voiceManager.js can delete it again once this game channel
// goes away — the caller is responsible for having already saved tempData
// via storage.setTempChannel before calling this, since this function
// persists its own update to it afterward.
async function announceGamePick(interaction, channel, tempData, gameLabel, gameEmoji, gameKey) {
  const config = storage.getGuildConfig(interaction.guild.id);
  if (!config.gameAnnounceChannelId) return;

  const announceChannel = interaction.guild.channels.cache.get(config.gameAnnounceChannelId);
  if (!announceChannel) {
    console.warn(`[gamevc] configured gameAnnounceChannelId ${config.gameAnnounceChannelId} not found`);
    return;
  }

  const roleId = gameKey && config.gameRoleIds ? config.gameRoleIds[gameKey] : null;

  try {
    const message = await announceChannel.send({
      content: roleId ? `<@&${roleId}>` : undefined,
      embeds: [buildAnnounceEmbed(interaction.member, channel, gameLabel, gameEmoji)],
      components: buildAnnounceComponents(channel),
    });
    tempData.announceMessageId = message.id;
    tempData.announceChannelId = announceChannel.id;
    storage.setTempChannel(channel.id, tempData);
  } catch (err) {
    console.warn(`[gamevc] could not post announcement for "${gameLabel}": ${err.message}`);
  }
}

async function handleGameInteraction(interaction) {
  // ---- Button clicks ----
  if (interaction.isButton()) {
    if (!interaction.customId.startsWith('game_')) return;

    // "Join Channel" button on an announcement message — this lives in the
    // announcements channel, not the game channel's own chat, so it can't
    // use the tempData-from-interaction.channel lookup below.
    if (interaction.customId.startsWith('game_announce_join_')) {
      const targetChannelId = interaction.customId.replace('game_announce_join_', '');
      const targetChannel = interaction.guild.channels.cache.get(targetChannelId);
      if (!targetChannel) {
        return interaction.reply({ content: 'That game room has already ended.', ephemeral: true });
      }

      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: `You need to be in a voice channel first — hop into any VC, then click **Join Channel** again and I'll move you into ${targetChannel}.`,
          ephemeral: true,
        });
      }
      if (voiceChannel.id === targetChannelId) {
        return interaction.reply({ content: `You're already in ${targetChannel}!`, ephemeral: true });
      }

      try {
        await interaction.member.voice.setChannel(targetChannel);
        return interaction.reply({ content: `Moved you into ${targetChannel} 🎮`, ephemeral: true });
      } catch (err) {
        console.warn(`[gamevc] could not move ${interaction.user.tag} into ${targetChannel.name}: ${err.message}`);
        return interaction.reply({
          content: `Couldn't move you automatically — join ${targetChannel} manually.`,
          ephemeral: true,
        });
      }
    }

    const channel = interaction.channel;
    const tempData = storage.getTempChannel(channel.id);
    if (!tempData || tempData.type !== 'game') return;

    if (interaction.user.id !== tempData.ownerId) {
      return interaction.reply({ content: 'Only the channel owner can do that.', ephemeral: true });
    }

    // "Others" — open a modal for a free-typed game name (no code involved).
    if (interaction.customId === 'game_pick_other') {
      return interaction.showModal(buildOtherGameModal());
    }

    // One of the listed games was clicked.
    if (interaction.customId.startsWith('game_pick_')) {
      const key = interaction.customId.replace('game_pick_', '');
      const game = getGameByKey(key);
      if (!game) return interaction.reply({ content: 'Unknown game.', ephemeral: true });

      // Roblox -> game name modal pops up immediately (needs to know which
      // Roblox game before the channel can even be named for it).
      // Valorant / Among Us -> no popup on pick anymore; they behave like
      // any other game (rename right away), and the "Set Party Code"
      // button shows up afterward instead (see getPromptType in
      // gamePanelView.js) for whenever they're ready to add one.
      if (game.prompt === 'name') {
        // Remember which game is waiting on its modal, since tempData.game
        // itself doesn't get set (and the channel doesn't get renamed)
        // until the modal is actually submitted below.
        tempData.pendingGameKey = key;
        storage.setTempChannel(channel.id, tempData);
        return interaction.showModal(buildGameNameModal());
      }

      // Ack immediately — channel.setName() below can silently hang for
      // minutes if Discord's rename rate limit (2 per 10 min per channel)
      // has been hit, and discord.js just queues the request rather than
      // erroring. Deferring first means that wait never causes a Discord
      // "application did not respond" failure; editReply can come whenever
      // the rename actually finishes.
      await interaction.deferUpdate();

      await setChannelGame(channel, tempData, channel.id, game.label, game.emoji);
      tempData.gameKey = game.key;
      tempData.partyCode = null;
      tempData.gameNameExtra = null;
      storage.setTempChannel(channel.id, tempData);
      await announceGamePick(interaction, channel, tempData, game.label, game.emoji, game.key);

      return interaction.editReply({
        embeds: [buildGamePanelEmbed(interaction.member, tempData)],
        components: buildGamePanelComponents(tempData),
      });
    }

    // "Change Game" — go back to the picker.
    if (interaction.customId === 'game_change') {
      tempData.game = null;
      tempData.gameEmoji = null;
      tempData.gameKey = null;
      tempData.partyCode = null;
      tempData.gameNameExtra = null;
      tempData.pendingGameKey = null;
      storage.setTempChannel(channel.id, tempData);

      return interaction.update({
        embeds: [buildGamePanelEmbed(interaction.member, tempData)],
        components: buildGamePanelComponents(tempData),
      });
    }

    // "Lock/Unlock" — same permission toggle as the regular panel's
    // tempvc_lock, just scoped to game channels. This button now lives on
    // the separate Room Controls message, so it refreshes that one.
    if (interaction.customId === 'game_lock') {
      await interaction.deferUpdate();
      tempData.locked = !tempData.locked;
      await channel.permissionOverwrites
        .edit(interaction.guild.roles.everyone, { Connect: !tempData.locked })
        .catch((err) => console.warn(`[gamevc] could not update lock state: ${err.message}`));
      storage.setTempChannel(channel.id, tempData);
      return interaction.editReply({
        embeds: [buildGameRoomControlsEmbed(interaction.member, tempData)],
        components: buildGameRoomControlsComponents(tempData),
      });
    }

    // "Set Limit" — cycles the same 0/2/5/10 options as the regular panel's
    // tempvc_limit. Also lives on the Room Controls message.
    if (interaction.customId === 'game_limit') {
      await interaction.deferUpdate();
      const options = [0, 2, 5, 10];
      const currentIndex = options.indexOf(tempData.limit || 0);
      const next = options[(currentIndex + 1) % options.length];
      tempData.limit = next;
      await channel.setUserLimit(next).catch((err) => console.warn(`[gamevc] could not update user limit: ${err.message}`));
      storage.setTempChannel(channel.id, tempData);
      return interaction.editReply({
        embeds: [buildGameRoomControlsEmbed(interaction.member, tempData)],
        components: buildGameRoomControlsComponents(tempData),
      });
    }

    // "Set/Edit Party Code" — re-open the code modal, pre-filled if one is
    // already set. This never touches the channel name, so it's never
    // subject to the rename rate limit.
    if (interaction.customId === 'game_code_edit_open') {
      return interaction.showModal(buildPartyCodeModal(tempData.partyCode || ''));
    }

    // "Set/Edit Game Name" — same idea, for Roblox.
    if (interaction.customId === 'game_name_edit_open') {
      return interaction.showModal(buildGameNameModal(tempData.gameNameExtra || ''));
    }

    return;
  }

  // ---- Modal submissions ----
  if (interaction.isModalSubmit()) {
    const channel = interaction.channel;
    const tempData = storage.getTempChannel(channel.id);
    if (!tempData || tempData.type !== 'game') return;

    if (interaction.customId === 'game_other_modal') {
      const name = sanitize(interaction.fields.getTextInputValue('game_other_name'));
      if (!name) return interaction.reply({ content: 'Game name can\'t be empty.', ephemeral: true });

      // Same rename-rate-limit reasoning as the game_pick_ buttons above.
      await interaction.deferUpdate();

      await setChannelGame(channel, tempData, channel.id, name, '🎮');
      tempData.gameKey = null; // custom entry, not one of the listed games
      tempData.partyCode = null;
      tempData.gameNameExtra = null;
      storage.setTempChannel(channel.id, tempData);
      await announceGamePick(interaction, channel, tempData, name, '🎮', null);

      return interaction.editReply({
        embeds: [buildGamePanelEmbed(interaction.member, tempData)],
        components: buildGamePanelComponents(tempData),
      });
    }

    if (interaction.customId === 'game_partycode_modal') {
      const code = sanitize(interaction.fields.getTextInputValue('game_partycode_input'));
      if (!code) return interaction.reply({ content: 'Party code can\'t be empty.', ephemeral: true });

      // Only the very first submission (right after picking Valorant/Among
      // Us) needs to rename the channel — an edit later on on an
      // already-named channel must NOT rename it again, or it'll eat into
      // the same 2-per-10-min rename budget for no reason.
      if (tempData.pendingGameKey) {
        const game = getGameByKey(tempData.pendingGameKey);
        await interaction.deferUpdate();
        if (game) {
          await setChannelGame(channel, tempData, channel.id, game.label, game.emoji);
          tempData.gameKey = game.key;
        }
        tempData.pendingGameKey = null;
        tempData.partyCode = code;
        storage.setTempChannel(channel.id, tempData);
        return interaction.editReply({
          embeds: [buildGamePanelEmbed(interaction.member, tempData)],
          components: buildGamePanelComponents(tempData),
        });
      }

      tempData.partyCode = code;
      storage.setTempChannel(channel.id, tempData);

      return interaction.update({
        embeds: [buildGamePanelEmbed(interaction.member, tempData)],
        components: buildGamePanelComponents(tempData),
      });
    }

    if (interaction.customId === 'game_name_modal') {
      const name = sanitize(interaction.fields.getTextInputValue('game_name_input'));
      if (!name) return interaction.reply({ content: 'Game name can\'t be empty.', ephemeral: true });

      // Same first-submission-renames-the-channel logic as the party code
      // modal above.
      if (tempData.pendingGameKey) {
        const game = getGameByKey(tempData.pendingGameKey);
        await interaction.deferUpdate();
        if (game) {
          await setChannelGame(channel, tempData, channel.id, game.label, game.emoji);
          tempData.gameKey = game.key;
          await announceGamePick(interaction, channel, tempData, game.label, game.emoji, game.key);
        }
        tempData.pendingGameKey = null;
        tempData.gameNameExtra = name;
        storage.setTempChannel(channel.id, tempData);
        return interaction.editReply({
          embeds: [buildGamePanelEmbed(interaction.member, tempData)],
          components: buildGamePanelComponents(tempData),
        });
      }

      tempData.gameNameExtra = name;
      storage.setTempChannel(channel.id, tempData);

      return interaction.update({
        embeds: [buildGamePanelEmbed(interaction.member, tempData)],
        components: buildGamePanelComponents(tempData),
      });
    }
  }
}

module.exports = { handleGameInteraction };
