const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

// Same violet accent as the regular temp-vc panel, for a consistent look.
const GAME_PANEL_COLOR = 0x8b5cf6;

// The buttoned game list. Add/remove entries freely — 5 buttons fit per
// row and Discord allows up to 5 rows, so this can grow to 25 before you'd
// need to switch to a select menu instead (same 25-cap reasoning as
// EMOJI_PALETTE in the regular panel).
const GAME_LIST = [
  { key: 'valorant', label: 'Valorant', emoji: '🎯' },
  { key: 'lol', label: 'League of Legends', emoji: '🗡️' },
  { key: 'minecraft', label: 'Minecraft', emoji: '⛏️' },
  { key: 'fortnite', label: 'Fortnite', emoji: '🪂' },
  { key: 'cs2', label: 'CS2', emoji: '🔫' },
  { key: 'gtav', label: 'GTA V', emoji: '🚗' },
  { key: 'cod', label: 'Call of Duty', emoji: '🎖️' },
  { key: 'apex', label: 'Apex Legends', emoji: '🪐' },
  { key: 'rocketleague', label: 'Rocket League', emoji: '🚀' },
];

// ---- main panel (before/after a game is picked) ----

function buildGamePanelEmbed(member, tempData) {
  const embed = new EmbedBuilder().setColor(GAME_PANEL_COLOR);

  if (!tempData.game) {
    embed
      .setTitle('🎮 Pick a Game')
      .setDescription(
        'Choose a game below — this renames the channel and lets everyone see what you\'re playing.\n\n' +
        'Owner-only controls above.'
      );
    return embed;
  }

  embed
    .setTitle(`${tempData.gameEmoji || '🎮'} ${tempData.game}`)
    .setDescription(
      (tempData.partyCode
        ? `**Party Code:** \`${tempData.partyCode}\``
        : 'No party code set yet. Click **Set Party Code** below if you have one to share.') +
      '\n\nOwner-only controls above.'
    );

  return embed;
}

function buildGamePanelComponents(tempData) {
  // A game has been picked — show "change game" + "party code" instead of
  // the full game list.
  if (tempData.game) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('game_change').setLabel('Change Game').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('game_partycode_open').setLabel('Set Party Code').setEmoji('🔑').setStyle(ButtonStyle.Primary),
    );
    return [row];
  }

  // No game picked yet — show the full list, 5 buttons per row, plus an
  // "Others" button at the end for anything not on the list.
  const rows = [];
  for (let i = 0; i < GAME_LIST.length; i += 5) {
    const chunk = GAME_LIST.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map((g) =>
          new ButtonBuilder().setCustomId(`game_pick_${g.key}`).setLabel(g.label).setEmoji(g.emoji).setStyle(ButtonStyle.Secondary)
        )
      )
    );
  }

  // "Others" goes on its own row so it's never squeezed out by the 5-per-row cap.
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('game_pick_other').setLabel('Others').setEmoji('➕').setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

// ---- modals ----

function buildOtherGameModal() {
  return new ModalBuilder()
    .setCustomId('game_other_modal')
    .setTitle('What game are you playing?')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('game_other_name')
          .setLabel('Game name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(50)
          .setRequired(true)
      )
    );
}

function buildPartyCodeModal() {
  return new ModalBuilder()
    .setCustomId('game_partycode_modal')
    .setTitle('Set Party Code')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('game_partycode_input')
          .setLabel('Party / lobby code')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(30)
          .setRequired(true)
      )
    );
}

module.exports = {
  GAME_LIST,
  buildGamePanelEmbed,
  buildGamePanelComponents,
  buildOtherGameModal,
  buildPartyCodeModal,
};
