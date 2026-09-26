// interactionHandler.js
// Handles clicks on the panel buttons built in panelView.js.
//
// "This interaction failed" fix: Discord requires SOME response within a
// few seconds of a button click, or the click just shows as failed to the
// user — even if the bot's code is still working fine in the background.
// Every branch below calls interaction.deferUpdate() immediately (a silent
// acknowledgement), THEN does the actual work (renaming, permission edits,
// etc.), THEN uses interaction.editReply(...) to update the panel message.
// A top-level try/catch also makes sure an error never leaves an
// interaction hanging with no response at all.
//
// HOW TO WIRE THIS UP: in your main bot file (wherever you do
// `client.login(...)`), add:
//
//   const { handleInteraction } = require('./interactionHandler');
//   client.on('interactionCreate', handleInteraction);

const storage = require('./storage');
const { buildPanelEmbed, buildPanelComponents } = require('./panelView');

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('tempvc_')) return;

  try {
    const channel = interaction.channel;
    const tempData = storage.getTempChannel(channel.id);

    if (!tempData) {
      return interaction.reply({ content: "This isn't a temp channel panel.", ephemeral: true });
    }
    if (interaction.user.id !== tempData.ownerId) {
      return interaction.reply({ content: 'Only the channel owner can do that.', ephemeral: true });
    }

    // Acknowledge right away so Discord never shows "This interaction
    // failed" even if the work below takes a moment.
    await interaction.deferUpdate();

    switch (interaction.customId) {
      case 'tempvc_lock': {
        tempData.locked = !tempData.locked;
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          Connect: !tempData.locked,
        });
        storage.setTempChannel(channel.id, tempData);
        return interaction.editReply({
          embeds: [buildPanelEmbed(interaction.member, tempData)],
          components: buildPanelComponents(),
        });
      }

      case 'tempvc_limit': {
        // Cycles through a few common limits each click. Swap for a modal
        // later if you want an exact-number entry instead.
        const options = [0, 2, 5, 10];
        const currentIndex = options.indexOf(tempData.limit || 0);
        const next = options[(currentIndex + 1) % options.length];
        tempData.limit = next;
        await channel.setUserLimit(next);
        storage.setTempChannel(channel.id, tempData);
        return interaction.editReply({
          embeds: [buildPanelEmbed(interaction.member, tempData)],
          components: buildPanelComponents(),
        });
      }

      case 'tempvc_rename': {
        const ownerName = interaction.member.displayName;
        const newName = `${tempData.emoji} ${ownerName}'s Channel`.slice(0, 100);
        await channel.setName(newName);
        storage.setTempChannel(channel.id, tempData);
        return interaction.editReply({
          embeds: [buildPanelEmbed(interaction.member, tempData)],
          components: buildPanelComponents(),
        });
      }

      case 'tempvc_trust':
      case 'tempvc_kick':
      case 'tempvc_transfer': {
        // Placeholder — picking a specific user isn't wired up yet.
        return interaction.followUp({
          content: 'Mention the user by typing `@username` in this chat — this isn\'t wired up to a picker yet.',
          ephemeral: true,
        });
      }

      default:
        return interaction.followUp({ content: 'Unknown action.', ephemeral: true });
    }
  } catch (err) {
    console.error('[interactionHandler] error handling click:', err);
    const payload = { content: 'Something went wrong — please try again.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

module.exports = { handleInteraction };
