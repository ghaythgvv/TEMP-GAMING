// gameInteractionHandler.js
// Handles every click/submit on the GAME panel (from gamePanelView.js):
// picking a listed game, picking "Others", and setting a party code / game
// name depending on which game was picked.
//
// Same "interaction failed" fix as interactionHandler.js: buttons that open
// a modal must respond with showModal() as their FIRST response (you can't
// defer before showing a modal — Discord rejects that). Every other button
// and every modal submission defers immediately, then edits the panel once
// the work is done, with a top-level try/catch as a safety net.
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
  buildExtraModal,
} = require('./gamePanelView');

function sanitize(name) {
  return name.replace(/\s+/g, ' ').trim().slice(0, 50);
}

async function handleGameInteraction(interaction) {
  try {
    // ---- Button clicks ----
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith('game_')) return;

      const channel = interaction.channel;
      const tempData = storage.getTempChannel(channel.id);
      if (!tempData || tempData.type !== 'game') return;

      if (interaction.user.id !== tempData.ownerId) {
        return interaction.reply({ content: 'Only the channel owner can do that.', ephemeral: true });
      }

      // Modal-opening buttons MUST respond with showModal() first — cannot
      // defer before this, Discord requires the modal to be the initial
      // response to the click.
      if (interaction.customId === 'game_pick_other') {
        return interaction.showModal(buildOtherGameModal());
      }
      if (interaction.customId === 'game_extra_open') {
        return interaction.showModal(buildExtraModal(tempData.extraType));
      }

      // Everything else: acknowledge immediately, then do the work.
      await interaction.deferUpdate();

      if (interaction.customId.startsWith('game_pick_')) {
        const key = interaction.customId.replace('game_pick_', '');
        const game = GAME_LIST.find((g) => g.key === key);
        if (!game) {
          return interaction.followUp({ content: 'Unknown game.', ephemeral: true });
        }

        await setChannelGame(channel, tempData, channel.id, game.label, game.emoji);
        tempData.extraType = game.prompt || null;
        tempData.extraValue = null;
        storage.setTempChannel(channel.id, tempData);

        return interaction.editReply({
          embeds: [buildGamePanelEmbed(interaction.member, tempData)],
          components: buildGamePanelComponents(tempData),
        });
      }

      if (interaction.customId === 'game_change') {
        tempData.game = null;
        tempData.gameEmoji = null;
        tempData.extraType = null;
        tempData.extraValue = null;
        storage.setTempChannel(channel.id, tempData);

        return interaction.editReply({
          embeds: [buildGamePanelEmbed(interaction.member, tempData)],
          components: buildGamePanelComponents(tempData),
        });
      }

      return;
    }

    // ---- Modal submissions ----
    if (interaction.isModalSubmit()) {
      const channel = interaction.channel;
      const tempData = storage.getTempChannel(channel.id);
      if (!tempData || tempData.type !== 'game') return;

      await interaction.deferUpdate();

      if (interaction.customId === 'game_other_modal') {
        const name = sanitize(interaction.fields.getTextInputValue('game_other_name'));
        if (!name) {
          return interaction.followUp({ content: "Game name can't be empty.", ephemeral: true });
        }

        await setChannelGame(channel, tempData, channel.id, name, '🎮');
        tempData.extraType = null;
        tempData.extraValue = null;
        storage.setTempChannel(channel.id, tempData);

        return interaction.editReply({
          embeds: [buildGamePanelEmbed(interaction.member, tempData)],
          components: buildGamePanelComponents(tempData),
        });
      }

      if (interaction.customId === 'game_extra_modal') {
        const value = sanitize(interaction.fields.getTextInputValue('game_extra_input'));
        if (!value) {
          return interaction.followUp({ content: "That can't be empty.", ephemeral: true });
        }

        tempData.extraValue = value;
        storage.setTempChannel(channel.id, tempData);

        return interaction.editReply({
          embeds: [buildGamePanelEmbed(interaction.member, tempData)],
          components: buildGamePanelComponents(tempData),
        });
      }
    }
  } catch (err) {
    console.error('[gameInteractionHandler] error handling interaction:', err);
    const payload = { content: 'Something went wrong — please try again.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

module.exports = { handleGameInteraction };
