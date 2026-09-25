// storage.js
// JSON-file-backed persistence for: per-user saved settings/emoji, live temp
// voice channel records, and per-guild configuration.
//
// NOTE: Railway's filesystem is ephemeral on redeploy/restart unless you
// attach a Volume mounted at this directory. Fine for now, but attach one
// before relying on this in production.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, tempChannels: {}, guildConfigs: {} }, null, 2));
  }
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('[storage] corrupt storage file, resetting:', err.message);
    const fresh = { users: {}, tempChannels: {}, guildConfigs: {} };
    writeAll(fresh);
    return fresh;
  }
}

function writeAll(data) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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
};
