// gameInteractionHandler.js
// Handles every click/select/submit on the GAME room panel (from
// gamePanelView.js): picking a game, and once one's picked, the full Room
// Controls set (Limit, Lock, Mute All, Party Code/Game Name, Rename,
// Access, Kick, Block).
//
// "This interaction failed" fix: buttons that open a MODAL must respond
// with showModal() as their first response (can't defer first — Discord
// requires the modal to be the initial response). Buttons that open a USER
// SELECT menu reply normally (ephemeral, not deferred) since that's a new
// message, not an edit of the panel. Everything else defers immediately,
// then edits, with a top-level try/catch as a safety net so no click is
// ever left hanging.
//
// HOW TO WIRE THIS UP: in your main bot file, alongside the regular panel
// handler:
//
//   const { handleGameInteraction } = require('./gameInteractionHandler');
//   client.on('interactionCreate', handleGameInteraction);

const storage = require('./storage');
const { setChannelGame } = require('./voiceManager');
const {
  GAME_LIST,
  buildGamePanelEmbed,
  buildGamePanelComponents,
  buildOtherGameModal,
  buildExtraModal,
  buildLimitModal,
  buildRenameModal,
  buildUserSelectRow,
} = require('./gamePanelView');

function sanitize(name) {
  return name.replace(/\s+/g, ' ').trim().slice(0, 100);
}

// Refreshes the panel message in place from within a deferred interaction.
async function updatePanel(interaction, channel, tempData) {
  return interaction.editReply({
    embeds: [buildGamePanelEmbed(interaction.member, tempData, channel.members.size)],
    components: buildGamePanelComponents(tempData),
  });
}

async function handleGameInteraction(interaction) {
  try {
    // ================= BUTTON CLICKS =================
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith('game_')) return;

      const channel = interaction.channel;
      const tempData = storage.getTempChannel(channel.id);
      if (!tempData || tempData.type !== 'game') return;

      if (interaction.user.id !== tempData.ownerId) {
        return interaction.reply({ content: 'Only the room owner can do that.', ephemeral: true });
      }

      // ---- Modal-opening buttons: must be the FIRST response ----
      if (interaction.customId === 'game_pick_other') {
        return interaction.showModal(buildOtherGameModal());
      }
      if (interaction.customId === 'game_extra_open') {
        return interaction.showModal(buildExtraModal(tempData.extraType));
      }
      if (interaction.customId === 'game_limit_open') {
        return interaction.showModal(buildLimitModal(tempData.limit));
      }
      if (interaction.customId === 'game_rename_open') {
        return interaction.showModal(buildRenameModal());
      }

      // ---- User-select-opening buttons: reply with a picker, don't defer ----
      if (interaction.customId === 'game_access_open') {
        return interaction.reply({
          content: 'Select a user to grant access to this room:',
          components: [buildUserSelectRow('game_access_select', 'Choose a user')],
          ephemeral: true,
        });
      }
      if (interaction.customId === 'game_kick_open') {
        return interaction.reply({
          content: 'Select a user to remove from this room:',
          components: [buildUserSelectRow('game_kick_select', 'Choose a user')],
          ephemeral: true,
        });
      }
      if (interaction.customId === 'game_block_open') {
        return interaction.reply({
          content: 'Select a user to block from this room:',
          components: [buildUserSelectRow('game_block_select', 'Choose a user')],
          ephemeral: true,
        });
      }

      // ---- Everything else: acknowledge immediately, then do the work ----
      await interaction.deferUpdate();

      if (interaction.customId.startsWith('game_pick_')) {
        const key = interaction.customId.replace('game_pick_', '');
        const game = GAME_LIST.find((g) => g.key === key);
        if (!game) {
          return interaction.followUp({ content: 'Unknown game.', ephemeral: true });
        }

        const renamed = await setChannelGame(channel, tempData, channel.id, game.label, game.emoji, game.categoryId);
        tempData.extraType = game.prompt || null;
        tempData.extraValue = null;
        storage.setTempChannel(channel.id, tempData);

        await updatePanel(interaction, channel, tempData);

        if (!renamed) {
          return interaction.followUp({
            content: '⚠️ Discord only allows a channel name to change twice every 10 minutes. Your pick was saved and the panel updated — the channel name will catch up once that limit resets.',
            ephemeral: true,
          });
        }
        return;
      }

      if (interaction.customId === 'game_change') {
        tempData.game = null;
        tempData.gameEmoji = null;
        tempData.extraType = null;
        tempData.extraValue = null;
        storage.setTempChannel(channel.id, tempData);
        return updatePanel(interaction, channel, tempData);
      }

      if (interaction.customId === 'game_lock') {
        tempData.locked = !tempData.locked;
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          Connect: !tempData.locked,
        });
        storage.setTempChannel(channel.id, tempData);
        return updatePanel(interaction, channel, tempData);
      }

      if (interaction.customId === 'game_muteall') {
        tempData.mutedAll = !tempData.mutedAll;
        storage.setTempChannel(channel.id, tempData);
        // Apply to whoever's in the room right now — the owner is exempt.
        // Newly joining members get this applied on join (see
        // onJoinTracked in voiceManager.js) since it's a "sticky" toggle.
        await Promise.all(
          channel.members
            .filter((m) => m.id !== tempData.ownerId)
            .map((m) => m.voice.setMute(tempData.mutedAll).catch(() => {}))
        );
        return updatePanel(interaction, channel, tempData);
      }

      return;
    }

    // ================= MODAL SUBMISSIONS =================
    if (interaction.isModalSubmit()) {
      const channel = interaction.channel;
      const tempData = storage.getTempChannel(channel.id);
      if (!tempData || tempData.type !== 'game') return;

      await interaction.deferUpdate();

      if (interaction.customId === 'game_other_modal') {
        const name = sanitize(interaction.fields.getTextInputValue('game_other_name'));
        if (!name) return interaction.followUp({ content: "Game name can't be empty.", ephemeral: true });

        const renamed = await setChannelGame(channel, tempData, channel.id, name, '🎮');
        tempData.extraType = null;
        tempData.extraValue = null;
        storage.setTempChannel(channel.id, tempData);

        await updatePanel(interaction, channel, tempData);

        if (!renamed) {
          return interaction.followUp({
            content: '⚠️ Discord only allows a channel name to change twice every 10 minutes. Your pick was saved — the channel name will catch up once that limit resets.',
            ephemeral: true,
          });
        }
        return;
      }

      if (interaction.customId === 'game_extra_modal') {
        const value = sanitize(interaction.fields.getTextInputValue('game_extra_input'));
        if (!value) return interaction.followUp({ content: "That can't be empty.", ephemeral: true });

        tempData.extraValue = value;
        storage.setTempChannel(channel.id, tempData);
        return updatePanel(interaction, channel, tempData);
      }

      if (interaction.customId === 'game_limit_modal') {
        const raw = interaction.fields.getTextInputValue('game_limit_input').trim();
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 99) {
          return interaction.followUp({ content: 'Enter a number between 0 and 99 (0 = unlimited).', ephemeral: true });
        }
        tempData.limit = parsed;
        storage.setTempChannel(channel.id, tempData);
        await channel.setUserLimit(parsed).catch((err) => {
          console.warn(`[gamevc] could not set user limit: ${err.message}`);
        });
        return updatePanel(interaction, channel, tempData);
      }

      if (interaction.customId === 'game_rename_modal') {
        const newName = sanitize(interaction.fields.getTextInputValue('game_rename_input'));
        if (!newName) return interaction.followUp({ content: "Name can't be empty.", ephemeral: true });

        await channel.setName(newName.slice(0, 100)).catch((err) => {
          console.warn(`[gamevc] could not rename channel: ${err.message}`);
          return interaction.followUp({
            content: '⚠️ Discord only allows a channel name to change twice every 10 minutes — try again shortly.',
            ephemeral: true,
          });
        });
        return updatePanel(interaction, channel, tempData);
      }

      return;
    }

    // ================= USER SELECT MENUS (Access / Kick / Block) =================
    if (interaction.isUserSelectMenu()) {
      if (!interaction.customId.startsWith('game_')) return;

      const channel = interaction.channel;
      const tempData = storage.getTempChannel(channel.id);
      if (!tempData || tempData.type !== 'game') return;

      if (interaction.user.id !== tempData.ownerId) {
        return interaction.reply({ content: 'Only the room owner can do that.', ephemeral: true });
      }

      const targetUser = interaction.users.first();
      if (!targetUser) {
        return interaction.update({ content: 'No user selected.', components: [] });
      }

      if (interaction.customId === 'game_access_select') {
        await channel.permissionOverwrites.edit(targetUser.id, { Connect: true }).catch(() => {});
        return interaction.update({ content: `✅ Access granted to <@${targetUser.id}>.`, components: [] });
      }

      if (interaction.customId === 'game_kick_select') {
        const targetMember = channel.members.get(targetUser.id);
        if (targetMember) await targetMember.voice.disconnect().catch(() => {});
        return interaction.update({ content: `➡️ <@${targetUser.id}> was removed from the room.`, components: [] });
      }

      if (interaction.customId === 'game_block_select') {
        await channel.permissionOverwrites.edit(targetUser.id, { Connect: false }).catch(() => {});
        const targetMember = channel.members.get(targetUser.id);
        if (targetMember) await targetMember.voice.disconnect().catch(() => {});
        return interaction.update({ content: `⛔ <@${targetUser.id}> was blocked from this room.`, components: [] });
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
