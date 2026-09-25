// storage.js
// Simple JSON-file-backed storage for temp voice channels / game panel data.
// No database was configured for this service, so this persists to a local
// data.json file on disk. On Railway, note that the filesystem is ephemeral
// unless you attach a Volume — mount one to /app/data if you need this to
// survive restarts/redeploys.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');

// ---- internal helpers -------------------------------------------------

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ channels: {}, guilds: {} }, null, 2));
  }
}

function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[storage] Failed to read/parse storage file, resetting.', err);
    const fresh = { channels: {}, guilds: {} };
    writeAll(fresh);
    return fresh;
  }
}

function writeAll(data) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---- channel-level storage (per temp voice channel) --------------------

function getChannelData(channelId) {
  const data = readAll();
  return data.channels[channelId] || null;
}

function setChannelData(channelId, value) {
  const data = readAll();
  data.channels[channelId] = { ...(data.channels[channelId] || {}), ...value };
  writeAll(data);
  return data.channels[channelId];
}

function deleteChannelData(channelId) {
  const data = readAll();
  delete data.channels[channelId];
  writeAll(data);
}

function getAllChannels() {
  const data = readAll();
  return data.channels;
}

// ---- guild-level storage (per-server settings) --------------------------

function getGuildData(guildId) {
  const data = readAll();
  return data.guilds[guildId] || null;
}

function setGuildData(guildId, value) {
  const data = readAll();
  data.guilds[guildId] = { ...(data.guilds[guildId] || {}), ...value };
  writeAll(data);
  return data.guilds[guildId];
}

function deleteGuildData(guildId) {
  const data = readAll();
  delete data.guilds[guildId];
  writeAll(data);
}

module.exports = {
  getChannelData,
  setChannelData,
  deleteChannelData,
  getAllChannels,
  getGuildData,
  setGuildData,
  deleteGuildData,
};
