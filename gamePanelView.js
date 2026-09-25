const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

// Green theme, distinct from the purple regular temp-vc panel.
const GAME_PANEL_COLOR = 0x2ecc71;

// The buttoned game list. Add/remove entries freely — 5 buttons fit per
// row and Discord allows up to 5 rows, so this can grow to 25 before you'd
// need to switch to a select menu instead (same 25-cap reasoning as
// EMOJI_PALETTE in the regular panel).
const GAME_LIST = [
  { key: 'valorant', label: 'Valorant', emoji: '🔫' },
  { key: 'lol', label: 'League of Legends', emoji: '⚔️' },
  { key: 'minecraft', label: 'Minecraft', emoji: '⛏️' },
  { key: 'fortnite', label: 'Fortnite', emoji: '🪂' },
  { key: 'cs2', label: 'CS2', emoji: '💣' },
  { key: 'gtav', label: 'GTA V', emoji: '🚗' },
  { key: 'cod', label: 'Call of Duty', emoji: '🎯' },
  { key: 'apex', label: 'Apex Legends', emoji: '🪖' },
  { key: 'rocketleague', label: 'Rocket League', emoji: '🏎️' },
];

// tempData is the same record stored in storage.js for this channel:
// { type: 'game', game: 'Valorant' | null, gameEmoji: '🔫' | null, ownerId, ... }
function buildGamePanelEmbed(ownerMember, tempData = {}) {
  const status = tempData.game
    ? `Currently playing: **${tempData.gameEmoji || '🎮'} ${tempData.game}**`
    : 'No game selected yet — pick one below!';

  const embed = new EmbedBuilder()
    .setColor(GAME_PANEL_COLOR)
    .setTitle('🎮 Pick a Game')
    .setDescription(
      [
        status,
        '',
        "Owner-only — pick a game and the channel renames itself. Leave when you're done and it cleans up automatically.",
      ].join('\n')
    );

  if (ownerMember) {
    embed.setThumbnail(ownerMember.displayAvatarURL({ size: 256 }));
    embed.setFooter({ text: `Owner: ${ownerMember.displayName}` });
  }

  return embed;
}

// The currently-selected game's button lights up green (Success) so it's
// obvious at a glance what's active, same idea as a "selected" state.
function buildGamePanelComponents(tempData = {}) {
  const rows = [];
  for (let i = 0; i < GAME_LIST.length; i += 5) {
    const chunk = GAME_LIST.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map((g) =>
          new ButtonBuilder()
            .setCustomId(`gamevc:pick:${g.key}`)
            .setLabel(g.label)
            .setEmoji(g.emoji)
            .setStyle(tempData.game === g.label ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('gamevc:other')
        .setLabel('Other Game')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('gamevc:delete')
        .setLabel('Delete Channel')
        .setEmoji('⬛')
        .setStyle(ButtonStyle.Danger)
    )
  );

  return rows;
}

function buildGameOtherModal() {
  const modal = new ModalBuilder().setCustomId('gamevc:other-modal').setTitle('Custom game');
  const input = new TextInputBuilder()
    .setCustomId('game')
    .setLabel('Game name')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(80)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

module.exports = { GAME_LIST, buildGamePanelEmbed, buildGamePanelComponents, buildGameOtherModal };
