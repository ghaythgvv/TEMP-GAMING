// storage.js
// JSON-file-backed persistence for: per-user saved settings/emoji, live temp
// voice channel records, per-guild configuration, and the list of members the
// bot server-muted through a game room's Mute All (so they can be unmuted the
// next time they join a voice channel, even after a restart).
//
// NOTE: Railway's filesystem is ephemeral on redeploy/restart unless you
// attach a Volume mounted at this directory. Attach one before relying on this
// in production, otherwise this list (and everything else) resets on redeploy.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');

function emptyData() {
  return { users: {}, tempChannels: {}, guildConfigs: {}, mutedVictims: [] };
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(emptyData(), null, 2));
  }
}

function readAll() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Older storage files won't have the newer keys yet.
    if (!data.mutedVictims) data.mutedVictims = [];
    return data;
  } catch (err) {
    console.error('[storage] corrupt storage file, resetting:', err.message);
    const fresh = emptyData();
    writeAll(fresh);
    return fresh;
  }
}

function writeAll(data) {
  ensureFile();
  // Write to a temp file, then rename, so a crash mid-write can't leave a
  // half-written (and therefore unreadable) storage file behind.
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---- per-user saved settings (carried over between that user's channels) ----

function getUserSettings(userId) {
  const data = readAll();
  return data.users[userId]?.settings || null;
}

function setUserSettings(userId, settings) {
  const data = readAll();
  if (!data.users[userId]) data.users[userId] = {};
  data.users[userId].settings = { ...(data.users[userId].settings || {}), ...settings };
  writeAll(data);
  return data.users[userId].settings;
}

// ---- per-user preferred emoji ----

function getUserEmoji(userId) {
  const data = readAll();
  return data.users[userId]?.emoji || null;
}

function setUserEmoji(userId, emoji) {
  const data = readAll();
  if (!data.users[userId]) data.users[userId] = {};
  data.users[userId].emoji = emoji;
  writeAll(data);
  return emoji;
}

// ---- live temp channel records ----

function getTempChannel(channelId) {
  const data = readAll();
  return data.tempChannels[channelId] || null;
}

function setTempChannel(channelId, value) {
  const data = readAll();
  data.tempChannels[channelId] = value;
  writeAll(data);
  return data.tempChannels[channelId];
}

function deleteTempChannel(channelId) {
  const data = readAll();
  delete data.tempChannels[channelId];
  writeAll(data);
}

function getAllTempChannels() {
  const data = readAll();
  return data.tempChannels;
}

// ---- per-guild config (join-to-create channel ids, categories, dashboard) ----

function getGuildConfig(guildId) {
  const data = readAll();
  return data.guildConfigs[guildId] || null;
}

function setGuildConfig(guildId, value) {
  const data = readAll();
  data.guildConfigs[guildId] = { ...(data.guildConfigs[guildId] || {}), ...value };
  writeAll(data);
  return data.guildConfigs[guildId];
}

// ---- members server-muted by a game room's Mute All ("guildId:userId" keys) ----
// These get unmuted the next time the member joins any voice channel.

function hasMutedVictim(key) {
  const data = readAll();
  return data.mutedVictims.includes(key);
}

function addMutedVictims(keys) {
  if (!keys || keys.length === 0) return;
  const data = readAll();
  data.mutedVictims = [...new Set([...data.mutedVictims, ...keys])];
  writeAll(data);
}

function removeMutedVictims(keys) {
  if (!keys || keys.length === 0) return;
  const data = readAll();
  const drop = new Set(keys);
  const before = data.mutedVictims.length;
  data.mutedVictims = data.mutedVictims.filter((k) => !drop.has(k));
  if (data.mutedVictims.length !== before) writeAll(data);
}

module.exports = {
  getUserSettings,
  setUserSettings,
  getUserEmoji,
  setUserEmoji,
  getTempChannel,
  setTempChannel,
  deleteTempChannel,
  getAllTempChannels,
  getGuildConfig,
  setGuildConfig,
  hasMutedVictim,
  addMutedVictims,
  removeMutedVictims,
};
