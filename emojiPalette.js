// emojiPalette.js
// Emoji pool used for a member's temp-channel emoji when they have no saved
// preference yet. Discord select menus / action rows cap at 25 options, so
// keep this at or under 25 if it's ever surfaced as a picker rather than
// just used internally for randomEmoji().

const EMOJI_PALETTE = [
  '🎮', '🎧', '🔥', '⚡', '🚀', '🎯', '🏆', '💎',
  '🌟', '👑', '🛡️', '⚔️', '🐉', '👾', '🕹️', '🎲',
  '🍀', '🌙', '☀️', '❄️', '🌈', '💀', '👻', '🎃',
  '🐺',
];

function randomEmoji() {
  return EMOJI_PALETTE[Math.floor(Math.random() * EMOJI_PALETTE.length)];
}

module.exports = { EMOJI_PALETTE, randomEmoji };
   
