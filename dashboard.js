// dashboard.js
// Keeps ONE message up to date with the ELITE VOICE CONTROL panel.

const { MessageFlags, ChannelType } = require('discord.js');
const storage = require('./storage');
const { panelPayload } = require('./elitePanelView');

// Put your channel IDs here. The code checks each one:
//  - text channel  -> the panel is posted there
//  - voice channel -> used as the "Join to Create" link
const CHANNEL_IDS = [
  '1550294167853207573',
  // 'ADD_THE_OTHER_CHANNEL_ID_HERE',
];

function resolveChannels(guild, config) {
  let dashboardId = config.dashboardChannelId;
  let createId = config.createChannelId ?? config.joinToCreateChannelId;

  for (const id of CHANNEL_IDS) {
    const ch = guild.channels.cache.get(id);
    if (!ch) continue;
    const isVoice = ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice;
    if (isVoice) createId = id;
    else dashboardId = id;
  }
  return { dashboardId, createId };
}

function collectRooms(guild) {
  const all = storage.getAllTempChannels();
  return Object.entries(all)
    .filter(([, data]) => data.guildId === guild.id)
    .map(([channelId]) => {
      const channel = guild.channels.cache.get(channelId);
      if (!channel) return null; // deleted since last refresh
      return { name: channel.name, count: channel.members.size };
    })
    .filter(Boolean);
}

async function refreshDashboard(guild) {
  if (!guild) return;
  const config = storage.getGuildConfig(guild.id) || {};
  const { dashboardId, createId } = resolveChannels(guild, config);
  if (!dashboardId) return; // nothing configured for this guild

  const dashboardChannel = guild.channels.cache.get(dashboardId);
  if (!dashboardChannel) {
    console.warn(`[dashboard] channel ${dashboardId} not found in ${guild.name}`);
    return;
  }

  const payload = panelPayload({
    rooms: collectRooms(guild),
    createChannelId: createId,
    settings: {
      autoLock: config.autoLock,
      antiRaid: config.antiRaid,
      nsfw: config.nsfw,
    },
  });

  try {
    let message = config.dashboardMessageId
      ? await dashboardChannel.messages.fetch(config.dashboardMessageId).catch(() => null)
      : null;

    // An old embed message can't become a Components V2 message:
    // delete it once and post a fresh one.
    if (message && !message.flags.has(MessageFlags.IsComponentsV2)) {
      await message.delete().catch(() => {});
      message = null;
    }

    if (message) {
      await message.edit(payload);
    } else {
      message = await dashboardChannel.send(payload);
      storage.setGuildConfig(guild.id, { dashboardChannelId: dashboardId, dashboardMessageId: message.id });
    }
  } catch (err) {
    console.warn(`[dashboard] could not refresh dashboard in ${guild.name}: ${err.message}`);
  }
}

module.exports = { refreshDashboard };
