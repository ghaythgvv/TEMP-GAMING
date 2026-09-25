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

const storage = require('./storage');
const { setChannelGame } = require('./voiceManager');
const {
  GAME_LIST,
  getGameByKey,
  getPromptType,
  buildGamePanelEmbed,
  buildGamePanelComponents,
  buildOtherGameModal,
  buildPartyCodeModal,
  buildGameNameModal,
} = require('./gamePanelView');

function sanitize(name) {
  return name.replace(/\s+/g, ' ').trim().slice(0, 50);
}

async function handleGameInteraction(interaction) {
  // ---- Button clicks ----
  if (interaction.isButton()) {
    if (!interaction.customId.startsWith('game_')) return;

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

      // Valorant / Among Us -> party code modal pops up immediately.
      // Roblox -> game name modal pops up immediately.
      // Everything else -> no modal, just rename straight away.
      if (game.prompt) {
        // Remember which game is waiting on its modal, since tempData.game
        // itself doesn't get set (and the channel doesn't get renamed)
        // until the modal is actually submitted below.
        tempData.pendingGameKey = key;
        storage.setTempChannel(channel.id, tempData);

        if (game.prompt === 'party') return interaction.showModal(buildPartyCodeModal());
        if (game.prompt === 'name') return interaction.showModal(buildGameNameModal());
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
