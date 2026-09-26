// utils.js
// Small text helpers shared across the panel/embed builders.

// Converts plain A-Z/a-z/0-9 into their "Mathematical Sans-Serif Bold"
// Unicode lookalikes (U+1D5D4 block) for a bold, stylized title look.
// These are individual Unicode codepoints, not a font reference — so
// unlike a bold *markdown* tag (which embed titles don't support anyway),
// every viewer sees the exact same bold glyphs with nothing to load.
const BOLD_UPPER_START = 0x1d5d4; // 𝗔
const BOLD_LOWER_START = 0x1d5ee; // 𝗮
const BOLD_DIGIT_START = 0x1d7ec; // 𝟬

function toFancyBold(text) {
  return String(text).replace(/[A-Za-z0-9]/g, (ch) => {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(BOLD_UPPER_START + (code - 65)); // A-Z
    if (code >= 97 && code <= 122) return String.fromCodePoint(BOLD_LOWER_START + (code - 97)); // a-z
    if (code >= 48 && code <= 57) return String.fromCodePoint(BOLD_DIGIT_START + (code - 48)); // 0-9
    return ch;
  });
}

// Splits a list of buttons into rows that are as evenly sized as possible
// (never a lone straggler on its own row), capped at maxPerRow per row.
// e.g. 13 items at maxPerRow 4 -> [4, 3, 3, 3] instead of [4, 4, 4, 1].
function chunkEvenly(items, maxPerRow) {
  const rowCount = Math.ceil(items.length / maxPerRow);
  const base = Math.floor(items.length / rowCount);
  let remainder = items.length % rowCount;

  const rows = [];
  let idx = 0;
  for (let r = 0; r < rowCount; r++) {
    const size = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    rows.push(items.slice(idx, idx + size));
    idx += size;
  }
  return rows;
}

module.exports = { toFancyBold, chunkEvenly };
