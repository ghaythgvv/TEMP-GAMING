// interactionHandler.js
// Listens for clicks on the panel buttons built in panelView.js and does
// the actual work (lock, limit, rename, trust, kick, transfer).
//
// HOW TO WIRE THIS UP: in your main bot file (wherever you do
// `client.login(...)`), add:
//
//   const { handleInteraction } = require('./interactionHandler');
//   client.on('interactionCreate', handleInteraction);

const storage = require('./storage');
const { refreshPanelMessage, updateOwnerPermissions } = require('./voiceManager');

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('tempvc_')) return;

  const channel = interaction.channel;
  const tempData = storage.getTempChannel(channel.id);
  if (!tempData) {
    return interaction.reply({ content: "This isn't a temp channel panel.", ephemeral: true });
  }

  // Only the channel owner can use these buttons.
  if (interaction.user.id !== tempData.ownerId) {
    return interaction.reply({ content: 'Only the channel owner can do that.', ephemeral: true });
  }

  switch (interaction.customId) {
    case 'tempvc_lock': {
      tempData.locked = !tempData.locked;
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        Connect: !tempData.locked,
      });
      storage.setTempChannel(channel.id, tempData);
      await refreshPanelMessage(channel, tempData);
      return interaction.reply({ content: tempData.locked ? '🔒 Channel locked.' : '🔓 Channel unlocked.', ephemeral: true });
    }

    case 'tempvc_limit': {
      // Cycles through a few common limits each click, so there's no modal
      // to build yet. Feel free to swap this for a modal later.
      const options = [0, 2, 5, 10];
      const currentIndex = options.indexOf(tempData.limit || 0);
      const next = options[(currentIndex + 1) % options.length];
      tempData.limit = next;
      await channel.setUserLimit(next);
      storage.setTempChannel(channel.id, tempData);
      await refreshPanelMessage(channel, tempData);
      return interaction.reply({ content: `👥 User limit set to ${next === 0 ? 'unlimited' : next}.`, ephemeral: true });
    }

    case 'tempvc_rename': {
      // Simple placeholder rename — swap in a Modal (TextInputBuilder) for
      // a real text-entry prompt when you're ready.
      const ownerName = interaction.member.displayName;
      const newName = `${tempData.emoji} ${ownerName}'s Channel`.slice(0, 100);
      await channel.setName(newName);
      storage.setTempChannel(channel.id, tempData);
      await refreshPanelMessage(channel, tempData);
      return interaction.reply({ content: `✏️ Renamed to "${newName}".`, ephemeral: true });
    }

    case 'tempvc_trust': {
      return interaction.reply({
        content: 'Mention the user to trust by typing `@username` in this chat — trust-by-mention isn\'t wired up yet, this is a placeholder.',
        ephemeral: true,
      });
    }

    case 'tempvc_kick': {
      return interaction.reply({
        content: 'Mention the user to kick by typing `@username` in this chat — kick-by-mention isn\'t wired up yet, this is a placeholder.',
        ephemeral: true,
      });
    }

    case 'tempvc_transfer': {
      return interaction.reply({
        content: 'Mention the user to transfer ownership to — transfer-by-mention isn\'t wired up yet, this is a placeholder.',
        ephemeral: true,
      });
    }

    default:
      return interaction.reply({ content: 'Unknown action.', ephemeral: true });
  }
}

module.exports = { handleInteraction };
