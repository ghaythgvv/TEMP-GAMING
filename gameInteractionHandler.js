// gameInteractionHandler.js
// Handles every click/submit on the GAME panel (from gamePanelView.js):
// picking a listed game, picking "Others", and setting a party code.
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
  buildGamePanelEmbed,
  buildGamePanelComponents,
  buildOtherGameModal,
  buildPartyCodeModal,
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

    // "Others" — open a modal for a free-typed game name.
    if (interaction.customId === 'game_pick_other') {
      return interaction.showModal(buildOtherGameModal());
    }

    // One of the listed games was clicked.
    if (interaction.customId.startsWith('game_pick_')) {
      const key = interaction.customId.replace('game_pick_', '');
      const game = GAME_LIST.find((g) => g.key === key);
      if (!game) return interaction.reply({ content: 'Unknown game.', ephemeral: true });

      await setChannelGame(channel, tempData, channel.id, game.label, game.emoji);
      tempData.partyCode = null; // clear any old code from a previous game
      storage.setTempChannel(channel.id, tempData);

      return interaction.update({
        embeds: [buildGamePanelEmbed(interaction.member, tempData)],
        components: buildGamePanelComponents(tempData),
      });
    }

    // "Change Game" — go back to the picker.
    if (interaction.customId === 'game_change') {
      tempData.game = null;
      tempData.gameEmoji = null;
      tempData.partyCode = null;
      storage.setTempChannel(channel.id, tempData);

      return interaction.update({
        embeds: [buildGamePanelEmbed(interaction.member, tempData)],
        components: buildGamePanelComponents(tempData),
      });
    }

    // "Set Party Code" — open a modal for the code.
    if (interaction.customId === 'game_partycode_open') {
      return interaction.showModal(buildPartyCodeModal());
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

      await setChannelGame(channel, tempData, channel.id, name, '🎮');
      tempData.partyCode = null;
      storage.setTempChannel(channel.id, tempData);

      return interaction.update({
        embeds: [buildGamePanelEmbed(interaction.member, tempData)],
        components: buildGamePanelComponents(tempData),
      });
    }

    if (interaction.customId === 'game_partycode_modal') {
      const code = sanitize(interaction.fields.getTextInputValue('game_partycode_input'));
      if (!code) return interaction.reply({ content: 'Party code can\'t be empty.', ephemeral: true });

      tempData.partyCode = code;
      storage.setTempChannel(channel.id, tempData);

      return interaction.update({
        embeds: [buildGamePanelEmbed(interaction.member, tempData)],
        components: buildGamePanelComponents(tempData),
      });
    }
  }
}

module.exports = { handleGameInteraction };
