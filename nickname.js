// nickname.js
// Syncs a member's server nickname with the emoji of the temp/static voice
// channel they're currently in, and strips any such emoji prefix back off.

// Matches one leading emoji + a trailing space, e.g. "🎮 " at the start of a
// nickname. `+` allows stripping a stacked/leftover prefix from a previous
// failed edit, not just a single one.
const EMOJI_PREFIX_RE = /^(?:\p{Extended_Pictographic}\uFE0F?\s)+/u;

function stripEmojiPrefixes(name) {
  if (!name) return name;
  return name.replace(EMOJI_PREFIX_RE, '').trim();
}

async function applyEmojiToMember(member, emoji) {
  if (!emoji || !member) return;
  try {
    const clean = stripEmojiPrefixes(member.displayName);
    const newNick = `${emoji} ${clean}`.slice(0, 32); // Discord nickname cap
    if (member.displayName === newNick) return; // already correct, skip the API call
    await member.setNickname(newNick);
  } catch (err) {
    // Common cause: the bot's role sits below this member's role, so Discord
    // silently rejects the rename. Log and move on rather than throwing.
    console.warn(`[nickname] could not set nickname for ${member.user.tag}: ${err.message}`);
  }
}

async function removeEmojiFromMember(member) {
  if (!member) return;
  try {
    const clean = stripEmojiPrefixes(member.displayName);
    if (member.displayName === clean) return; // nothing to strip
    // Passing null resets to the account username when the cleaned name
    // matches it, avoiding a redundant nickname entry that's identical to
    // the username.
    await member.setNickname(clean === member.user.username ? null : clean);
  } catch (err) {
    console.warn(`[nickname] could not clear nickname for ${member.user.tag}: ${err.message}`);
  }
}

module.exports = { applyEmojiToMember, removeEmojiFromMember, stripEmojiPrefixes };
