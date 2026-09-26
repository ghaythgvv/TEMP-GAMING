const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require('discord.js');

// Green theme, distinct from the purple regular temp-vc panel.
const GAME_PANEL_COLOR = 0x2ecc71;

// The buttoned game list. Add/remove entries freely — 5 buttons fit per
// row and Discord allows up to 5 rows, so this can grow to 25 before you'd
// need to switch to a select menu instead (same 25-cap reasoning as
// EMOJI_PALETTE in the regular panel).
//
// `prompt` controls the optional second field/button shown once this game
// is picked:
//   'party' -> "Party Code" (Valorant, Among Us — games with a single
//              lobby/party code you invite people with)
//   'name'  -> "Game Name" (Roblox — the platform itself isn't the game,
//              so this captures which Roblox experience it is)
//   undefined -> no extra field
//
// `categoryId` (when set) moves the channel into that game's own category
// the moment it's picked, on top of the rename — games without one just
// stay wherever the channel already is.
//
// Emojis here are this server's own custom emojis (<:name:id> format).
const GAME_LIST = [
  { key: 'valorant', label: 'Valorant', emoji: '<:images1:1553240634079314010>', prompt: 'party', categoryId: '1513904163237658624' },
  { key: 'lol', label: 'League of Legends', emoji: '<:3907_lol:1553240599321116773>', categoryId: '1513904166349574266' },
  { key: 'minecraft', label: 'Minecraft', emoji: '<:401852minecraftpelogo:1553240528471068753>', categoryId: '1513904165368107059' },
  { key: 'fortnite', label: 'Fortnite', emoji: '<:481292fortnite:1553240486742065192>', categoryId: '1513904162113454211' },
  { key: 'cs2', label: 'CS2', emoji: '<:28349cs21:1553240555033731252>', categoryId: '1513904171349442621' },
  { key: 'gtav', label: 'GTA V', emoji: '<:450991grandtheftautov:1553240503896776765>', categoryId: '1513904167893078148' },
  { key: 'cod', label: 'Call of Duty', emoji: '<:dm_call_of_duty128:1553240959700045825>' },
  { key: 'apex', label: 'Apex Legends', emoji: '<:Apex1281:1553240957951148052>' },
  { key: 'rocketleague', label: 'Rocket League', emoji: '<:rocket_l128:1553240961084162118>', categoryId: '1513904163950559415' },
  { key: 'amongus', label: 'Among Us', emoji: '<:among_us128:1553241086926000168>', prompt: 'party', categoryId: '1513904163237658624' },
  { key: 'roblox', label: 'Roblox', emoji: '<:roblox128:1553241088330965113>', prompt: 'name', categoryId: '1513904172653613167' },
  { key: 'mlbb', label: 'MLBB', emoji: '<:3451_mlbb:1553311380684144672>', categoryId: '1543651761292836947' },
];

// ---- embed ----

function buildGamePanelEmbed(member, tempData, memberCount) {
  const ownerName = member ? member.displayName : 'Unknown';
  const embed = new EmbedBuilder().setColor(GAME_PANEL_COLOR);
  if (member) embed.setThumbnail(member.displayAvatarURL({ size: 256 }));

  // Before a game is picked: simple picker screen, no stats yet.
  if (!tempData.game) {
    embed
      .setTitle('🎮 Game Channel')
      .setDescription(
        'Welcome to your Game Room!\nThis is your control panel — use it wisely,\nEnjoy your gaming experience.\n\nPick a game below to get started.'
      )
      .addFields({ name: 'Room Owner', value: ownerName });
    return embed;
  }

  // After a game is picked: the full "Room Controls" style stats view.
  const limitText = tempData.limit && tempData.limit > 0 ? `${tempData.limit}` : 'Unlimited';
  const roomCountText = `${memberCount ?? 0}/${tempData.limit && tempData.limit > 0 ? tempData.limit : '∞'}`;
  const stateText = `${tempData.locked ? '🔒 Locked' : '🔓 Unlocked'} · 👁 Visible · ${tempData.mutedAll ? '🔇 Muted' : '🔊 Unmuted'}`;
  const createdText = tempData.createdAt ? `<t:${Math.floor(tempData.createdAt / 1000)}:R>` : 'Unknown';

  embed
    .setTitle('🕹️ Room Controls')
    .setDescription('Welcome to your Game Room!\nThis is your control panel — use it wisely,\nEnjoy your gaming experience.')
    .addFields(
      { name: 'Room Owner', value: ownerName, inline: false },
      { name: 'Selected Game', value: `${tempData.gameEmoji || '🎮'} ${tempData.game}`, inline: false },
      { name: 'Limit', value: limitText, inline: true },
      { name: 'In Room', value: roomCountText, inline: true },
      { name: 'State', value: stateText, inline: false },
    );

  if (tempData.extraType === 'party') {
    embed.addFields({ name: 'Party Code', value: tempData.extraValue ? `\`${tempData.extraValue}\`` : '—', inline: false });
  } else if (tempData.extraType === 'name') {
    embed.addFields({ name: 'Game Name', value: tempData.extraValue || '—', inline: false });
  }

  embed.addFields({ name: 'Created', value: createdText, inline: false });

  return embed;
}

// ---- buttons ----

function buildGamePanelComponents(tempData) {
  if (!tempData.game) {
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

  // Game picked — full Room Controls button set.
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('game_limit_open').setLabel('Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('game_lock').setLabel('Lock / Unlock').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('game_muteall').setLabel('Mute All').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
  );

  const row2Buttons = [];
  if (tempData.extraType === 'party') {
    row2Buttons.push(
      new ButtonBuilder().setCustomId('game_extra_open').setLabel('Party Code').setEmoji('🔑').setStyle(ButtonStyle.Primary)
    );
  } else if (tempData.extraType === 'name') {
    row2Buttons.push(
      new ButtonBuilder().setCustomId('game_extra_open').setLabel('Game Name').setEmoji('🎲').setStyle(ButtonStyle.Primary)
    );
  }
  row2Buttons.push(
    new ButtonBuilder().setCustomId('game_rename_open').setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(row2Buttons);

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('game_access_open').setLabel('Access').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('game_kick_open').setLabel('Kick').setEmoji('➡️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('game_block_open').setLabel('Block').setEmoji('⛔').setStyle(ButtonStyle.Danger),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('game_change').setLabel('Change Game').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3, row4];
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

function buildLimitModal(currentLimit) {
  return new ModalBuilder()
    .setCustomId('game_limit_modal')
    .setTitle('Set User Limit')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('game_limit_input')
          .setLabel('Max users (0 = unlimited, max 99)')
          .setStyle(TextInputStyle.Short)
          .setValue(currentLimit ? `${currentLimit}` : '0')
          .setMaxLength(2)
          .setRequired(true)
      )
    );
}

function buildRenameModal() {
  return new ModalBuilder()
    .setCustomId('game_rename_modal')
    .setTitle('Rename Channel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('game_rename_input')
          .setLabel('New channel name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
      )
    );
}

// ---- user select menus (Access / Kick / Block) ----

function buildUserSelectRow(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1)
  );
}

module.exports = {
  GAME_LIST,
  buildGamePanelEmbed,
  buildGamePanelComponents,
  buildOtherGameModal,
  buildExtraModal,
  buildLimitModal,
  buildRenameModal,
  buildUserSelectRow,
};
