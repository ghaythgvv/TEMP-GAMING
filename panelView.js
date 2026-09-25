// panelView.js
// Builds the embed + buttons posted in every regular (non-game) temp voice
// channel. Wire a matching interactionCreate handler elsewhere in the bot
// that listens for these customIds and calls back into voiceManager.js /
// storage.js as needed — this file only builds the message, it doesn't
// handle clicks.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PANEL_COLOR = 0x8b5cf6; // violet accent, matches the server's panel theme

function buildPanelEmbed(ownerMember, tempData) {
  const ownerName = ownerMember ? ownerMember.displayName : 'Unknown';
  const limitText = tempData.limit && tempData.limit > 0 ? `${tempData.limit}` : 'Unlimited';
  const lockedText = tempData.locked ? '🔒 Locked' : '🔓 Unlocked';
  const trustedCount = (tempData.trusted || []).length;
  const cleanupText =
    typeof tempData.cleanupIntervalMinutes === 'number' && tempData.cleanupIntervalMinutes > 0
      ? `Every ${tempData.cleanupIntervalMinutes} min`
      : 'Off';

  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`${tempData.emoji || '🔊'} Channel Panel`)
    .setDescription(
      `${lockedText} • Limit: ${limitText} • Auto-clean: ${cleanupText}\n\n` +
      `Owner-only controls below.\n\n` +
      `**Owner:** ${tempData.emoji || ''} ${ownerName}`
    )
    .addFields(
      { name: 'Trusted Users', value: `${trustedCount}`, inline: true },
    );
}

function buildPanelComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc_lock').setLabel('Lock/Unlock').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc_limit').setLabel('Set Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc_rename').setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc_trust').setLabel('Trust User').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tempvc_kick').setLabel('Kick User').setEmoji('🚫').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tempvc_transfer').setLabel('Transfer Owner').setEmoji('👑').setStyle(ButtonStyle.Primary),
  );
  return [row1, row2];
}

function buildPanelAttachments() {
  // No banner image by default — return files here if you want to attach
  // one (e.g. files: [{ attachment: path.join(__dirname, 'assets/banner.png'), name: 'banner.png' }]).
  return [];
}

module.exports = { buildPanelEmbed, buildPanelComponents, buildPanelAttachments };
