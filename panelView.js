// panelView.js
// Builds the embed + buttons posted in every regular (non-game) temp voice
// channel. Restyled to a compact status-line layout (theme borrowed from a
// reference panel screenshot — button set is unchanged, only the look).
// Wire a matching interactionCreate handler elsewhere in the bot that
// listens for these customIds — this file only builds the message, it
// doesn't handle clicks (see interactionHandler.js).

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PANEL_COLOR = 0x8e44ec; // purple accent, matches the reference panel's vibe

function buildPanelEmbed(ownerMember, tempData) {
  const ownerName = ownerMember ? ownerMember.displayName : 'Unknown';
  const limitText = tempData.limit && tempData.limit > 0 ? `Limit ${tempData.limit}` : 'No limit';
  const lockedText = tempData.locked ? '🔒 Locked' : '🔓 Unlocked';
  const trustedCount = (tempData.trusted || []).length;
  const cleanupText =
    typeof tempData.cleanupIntervalMinutes === 'number' && tempData.cleanupIntervalMinutes > 0
      ? `Auto-delete every ${tempData.cleanupIntervalMinutes} min`
      : 'Auto-delete off';

  const statusLine = `${lockedText} • ${limitText} • Trusted: ${trustedCount} • ${cleanupText}`;

  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`${tempData.emoji || '🔊'} Channel Panel`)
    .setDescription(`${statusLine}\n\nOwner-only controls below.`)
    .setThumbnail(ownerMember ? ownerMember.displayAvatarURL({ size: 256 }) : null)
    .addFields({ name: 'Owner', value: `${tempData.emoji || ''} ${ownerName}`.trim() });
}

function buildPanelComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc_lock').setLabel('Lock / Unlock').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc_limit').setLabel('Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc_rename').setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc_trust').setLabel('Trust').setEmoji('🛡️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tempvc_kick').setLabel('Kick').setEmoji('🚫').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tempvc_transfer').setLabel('Transfer Ownership').setEmoji('🔄').setStyle(ButtonStyle.Primary),
  );
  return [row1, row2];
}

function buildPanelAttachments() {
  // No banner image by default — return files here if you want to attach
  // one (e.g. files: [{ attachment: path.join(__dirname, 'assets/banner.png'), name: 'banner.png' }]).
  return [];
}

module.exports = { buildPanelEmbed, buildPanelComponents, buildPanelAttachments };
