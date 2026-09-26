const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { toFancyBold, chunkEvenly } = require('./utils');

// Same violet accent as the regular temp-vc panel, for a consistent look.
const GAME_PANEL_COLOR = 0x8b5cf6;

// Max buttons per row before wrapping to the next one. Rows are balanced
// evenly (see chunkEvenly in utils.js) so there's never a lone straggler
// button dangling on its own row.
const BUTTONS_PER_ROW = 4;

// The buttoned game list. Add/remove entries freely — 5 buttons fit per
// row and Discord allows up to 5 rows, so this can grow to 25 before you'd
// need to switch to a select menu instead (same 25-cap reasoning as
// EMOJI_PALETTE in the regular panel).
//
// `prompt` controls what happens right when the button is clicked:
//   'party'  -> a "Party Code" modal pops up immediately (Valorant, Among Us)
//   'name'   -> a "Game Name" modal pops up immediately (Roblox)
//   omitted  -> no modal, the channel is just renamed straight away
const GAME_LIST = [
  { key: 'valorant', label: 'Valorant', emoji: '🎯', prompt: 'party' },
  { key: 'lol', label: 'League of Legends', emoji: '🗡️' },
  { key: 'minecraft', label: 'Minecraft', emoji: '⛏️' },
  { key: 'fortnite', label: 'Fortnite', emoji: '🪂' },
  { key: 'cs2', label: 'CS2', emoji: '🔫' },
  { key: 'gtav', label: 'GTA V', emoji: '🚗' },
  { key: 'cod', label: 'Call of Duty', emoji: '🎖️' },
  { key: 'apex', label: 'Apex Legends', emoji: '🪐' },
  { key: 'rocketleague', label: 'Rocket League', emoji: '🚀' },
  { key: 'amongus', label: 'Among Us', emoji: '🛸', prompt: 'party' },
  { key: 'roblox', label: 'Roblox', emoji: '🧱', prompt: 'name' },
  { key: 'mlbb', label: 'MLBB', emoji: '📱' },
];

function getGameByKey(key) {
  return GAME_LIST.find((g) => g.key === key) || null;
}

// Looks up what kind of modal (if any) a currently-picked game uses, from
// the key stored on tempData — so the panel knows whether to show
// "Set/Edit Party Code", "Set/Edit Game Name", or nothing at all.
function getPromptType(gameKey) {
  const game = getGameByKey(gameKey);
  return game ? game.prompt || null : null;
}

// ---- main panel (before/after a game is picked) ----

function buildGamePanelEmbed(member, tempData) {
  const embed = new EmbedBuilder().setColor(GAME_PANEL_COLOR);

  if (!tempData.game) {
    embed
      .setTitle(`🎮 ${toFancyBold('PICK A GAME')}`)
      .setDescription(
        '🕹️ **Choose a game below** — the channel renames itself and everyone can see what\'s being played.\n\n' +
        `🔑 **Valorant** & **Among Us** get a *Set Party Code* button once picked.\n` +
        `📝 **Roblox** asks which game right away.\n` +
        `➕ Playing something else? Hit **Others** and type it in.\n\n` +
        '*Owner-only controls above.*'
      );
    return embed;
  }

  const promptType = getPromptType(tempData.gameKey);
  let extraLine = '';
  if (promptType === 'party') {
    extraLine = tempData.partyCode
      ? `🔑 **Party Code**\n\`\`\`${tempData.partyCode}\`\`\``
      : '🔑 *No party code set yet — click* **Set Party Code** *above if you have one to share.*';
  } else if (promptType === 'name') {
    extraLine = tempData.gameNameExtra
      ? `📝 **Game Name**\n\`\`\`${tempData.gameNameExtra}\`\`\``
      : '📝 *No game name set yet — click* **Set Game Name** *above.*';
  }

  const startedLine = tempData.gameSetAt
    ? `⏱️ Playing since <t:${Math.floor(tempData.gameSetAt / 1000)}:R>`
    : '';

  embed
    .setTitle(`${tempData.gameEmoji || '🎮'} ${toFancyBold(String(tempData.game).toUpperCase())}`)
    .setDescription(
      ['### Now Playing', startedLine, extraLine, '*Owner-only controls above.*']
        .filter(Boolean)
        .join('\n\n')
    );

  return embed;
}

function buildGamePanelComponents(tempData) {
  // A game has been picked — show "change game" plus, only for games that
  // actually use one, a set/edit button for their party code or game name.
  if (tempData.game) {
    const buttons = [
      new ButtonBuilder().setCustomId('game_change').setLabel('Change Game').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ];

    const promptType = getPromptType(tempData.gameKey);
    if (promptType === 'party') {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('game_code_edit_open')
          .setLabel(tempData.partyCode ? 'Edit Party Code' : 'Set Party Code')
          .setEmoji('🔑')
          .setStyle(ButtonStyle.Secondary)
      );
    } else if (promptType === 'name') {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('game_name_edit_open')
          .setLabel(tempData.gameNameExtra ? 'Edit Game Name' : 'Set Game Name')
          .setEmoji('📝')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    return [new ActionRowBuilder().addComponents(buttons)];
  }

  // No game picked yet — show the full list, lined up evenly (see
  // chunkEvenly in utils.js) so there's never a lone button hanging on its
  // own row, however many games end up on the list.
  const allButtons = [...GAME_LIST, { key: 'other', label: 'Others', emoji: '➕' }];
  return chunkEvenly(allButtons, BUTTONS_PER_ROW).map((chunk) =>
    new ActionRowBuilder().addComponents(
      chunk.map((g) =>
        new ButtonBuilder().setCustomId(`game_pick_${g.key}`).setLabel(g.label).setEmoji(g.emoji).setStyle(ButtonStyle.Secondary)
      )
    )
  );
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

// currentValue pre-fills the box (used when re-opening this modal to EDIT
// an already-set code, so the owner doesn't have to retype it from scratch).
function buildPartyCodeModal(currentValue) {
  const input = new TextInputBuilder()
    .setCustomId('game_partycode_input')
    .setLabel('Party / lobby code')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(30)
    .setRequired(true);
  if (currentValue) input.setValue(currentValue);

  return new ModalBuilder()
    .setCustomId('game_partycode_modal')
    .setTitle('Set Party Code')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

// Same idea as buildPartyCodeModal, but for Roblox's "which game" field.
function buildGameNameModal(currentValue) {
  const input = new TextInputBuilder()
    .setCustomId('game_name_input')
    .setLabel('Game Name')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(50)
    .setRequired(true);
  if (currentValue) input.setValue(currentValue);

  return new ModalBuilder()
    .setCustomId('game_name_modal')
    .setTitle('Set Game Name')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

module.exports = {
  GAME_LIST,
  getGameByKey,
  getPromptType,
  buildGamePanelEmbed,
  buildGamePanelComponents,
  buildOtherGameModal,
  buildPartyCodeModal,
  buildGameNameModal,
};
