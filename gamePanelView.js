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
//
// `prompt` controls the optional second button shown once this game is
// picked:
//   'party' -> "Set Party Code" (Valorant, Among Us — games with a single
//              lobby/party code you invite people with)
//   'name'  -> "Set Game Name" (Roblox — the platform itself isn't the
//              game, so this captures which Roblox experience it is)
//   undefined -> no second button, just "Change Game"
//
// Emojis here are this server's own custom emojis (<:name:id> format).
const GAME_LIST = [
  { key: 'valorant', label: 'Valorant', emoji: '<:images1:1553240634079314010>', prompt: 'party' },
  { key: 'lol', label: 'League of Legends', emoji: '<:3907_lol:1553240599321116773>' },
  { key: 'minecraft', label: 'Minecraft', emoji: '<:401852minecraftpelogo:1553240528471068753>' },
  { key: 'fortnite', label: 'Fortnite', emoji: '<:481292fortnite:1553240486742065192>' },
  { key: 'cs2', label: 'CS2', emoji: '<:28349cs21:1553240555033731252>' },
  { key: 'gtav', label: 'GTA V', emoji: '<:450991grandtheftautov:1553240503896776765>' },
  { key: 'cod', label: 'Call of Duty', emoji: '<:dm_call_of_duty128:1553240959700045825>' },
  { key: 'apex', label: 'Apex Legends', emoji: '<:Apex1281:1553240957951148052>' },
  { key: 'rocketleague', label: 'Rocket League', emoji: '<:rocket_l128:1553240961084162118>' },
  { key: 'amongus', label: 'Among Us', emoji: '<:among_us128:1553241086926000168>', prompt: 'party' },
  { key: 'roblox', label: 'Roblox', emoji: '<:roblox128:1553241088330965113>', prompt: 'name' },
  { key: 'mlbb', label: 'MLBB', emoji: '<:3451_mlbb:1553311380684144672>' },
];

// ---- main panel (before/after a game is picked) ----

function buildGamePanelEmbed(member, tempData) {
  const ownerName = member ? member.displayName : 'Unknown';
  const embed = new EmbedBuilder().setColor(GAME_PANEL_COLOR);
  if (member) embed.setThumbnail(member.displayAvatarURL({ size: 256 }));

  if (!tempData.game) {
    embed
      .setTitle('🎮 Game Channel')
      .setDescription('Pick a game below — this renames the channel and lets everyone see what you\'re playing.\n\nOwner-only controls below.')
      .addFields({ name: 'Owner', value: ownerName });
    return embed;
  }

  let extraLine = '';
  if (tempData.extraType === 'party') {
    extraLine = tempData.extraValue ? `🔑 **Party Code:** \`${tempData.extraValue}\`` : '🔑 No party code set yet.';
  } else if (tempData.extraType === 'name') {
    extraLine = tempData.extraValue ? `🎲 **Playing:** ${tempData.extraValue}` : '🎲 No specific game set yet.';
  }

  embed
    .setTitle(`${tempData.gameEmoji || '🎮'} ${tempData.game}`)
    .setDescription(`${extraLine}${extraLine ? '\n\n' : ''}Owner-only controls below.`)
    .addFields({ name: 'Owner', value: ownerName });

  return embed;
}

function buildGamePanelComponents(tempData) {
  // A game has been picked — show "change game" + whatever second button
  // (if any) that game's `extra` type calls for.
  if (tempData.game) {
    const buttons = [
      new ButtonBuilder().setCustomId('game_change').setLabel('Change Game').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ];

    if (tempData.extraType === 'party') {
      buttons.push(
        new ButtonBuilder().setCustomId('game_extra_open').setLabel('Set Party Code').setEmoji('🔑').setStyle(ButtonStyle.Primary)
      );
    } else if (tempData.extraType === 'name') {
      buttons.push(
        new ButtonBuilder().setCustomId('game_extra_open').setLabel('Set Game Name').setEmoji('🎲').setStyle(ButtonStyle.Primary)
      );
    }

    return [new ActionRowBuilder().addComponents(buttons)];
  }

  // No game picked yet — show the full list, 5 buttons per row, plus an
  // "Others" button on its own row at the end.
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

// One shared modal for both "extra" types — label changes depending on
// whether this game wants a party code or a specific game name.
function buildExtraModal(extraType) {
  const isGameName = extraType === 'name';
  return new ModalBuilder()
    .setCustomId('game_extra_modal')
    .setTitle(isGameName ? 'Set Game Name' : 'Set Party Code')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('game_extra_input')
          .setLabel(isGameName ? 'Which Roblox game?' : 'Party / lobby code')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(isGameName ? 50 : 30)
          .setRequired(true)
      )
    );
}

module.exports = {
  GAME_LIST,
  buildGamePanelEmbed,
  buildGamePanelComponents,
  buildOtherGameModal,
  buildExtraModal,
};
