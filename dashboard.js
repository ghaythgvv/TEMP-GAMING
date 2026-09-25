// dashboard.js
// Keeps one overview message (if configured) up to date with a live list of
// every active temp/game voice channel in the guild. Looks for
// `dashboardChannelId` (and optionally a saved `dashboardMessageId`) on the
// guild's config record in storage — set those via whatever setup/config
// command your bot uses. If nothing is configured, this quietly no-ops so
// guilds that don't use a dashboard aren't affected.

const { EmbedBuilder } = require('discord.js');
const storage = require('./storage');

const DASHBOARD_COLOR = 0x2f3136;

function buildDashboardEmbed(guild, channels) {
  const embed = new EmbedBuilder()
    .setColor(DASHBOARD_COLOR)
    .setTitle(`${guild.name} — Active Voice Channels`)
    .setTimestamp();

  if (channels.length === 0) {
    embed.setDescription('No active temp channels right now.');
    return embed;
  }

  const lines = channels.map(({ channelId, data }) => {
    const channel = guild.channels.cache.get(channelId);
    const name = channel ? channel.name : `(deleted #${channelId})`;
    const count = channel ? channel.members.size : 0;
    const ownerTag = data.ownerId ? `<@${data.ownerId}>` : 'unknown';
    return `${name} — ${count} member(s) — owner: ${ownerTag}`;
  });

  embed.setDescription(lines.join('\n').slice(0, 4000));
  return embed;
}

async function refreshDashboard(guild) {
  if (!guild) return;
  const config = storage.getGuildConfig(guild.id);
  if (!config || !config.dashboardChannelId) return; // no dashboard configured for this guild

  const dashboardChannel = guild.channels.cache.get(config.dashboardChannelId);
  if (!dashboardChannel) {
    console.warn(`[dashboard] configured dashboardChannelId ${config.dashboardChannelId} not found in ${guild.name}`);
    return;
  }

  const all = storage.getAllTempChannels();
  const channels = Object.entries(all)
    .filter(([, data]) => data.guildId === guild.id)
    .map(([channelId, data]) => ({ channelId, data }));

  const embed = buildDashboardEmbed(guild, channels);

  try {
    let message = config.dashboardMessageId
      ? await dashboardChannel.messages.fetch(config.dashboardMessageId).catch(() => null)
      : null;

    if (message) {
      await message.edit({ embeds: [embed] });
    } else {
      message = await dashboardChannel.send({ embeds: [embed] });
      storage.setGuildConfig(guild.id, { dashboardMessageId: message.id });
    }
  } catch (err) {
    console.warn(`[dashboard] could not refresh dashboard in ${guild.name}: ${err.message}`);
  }
}

module.exports = { refreshDashboard };
