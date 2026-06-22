const { randomFillSync } = require("node:crypto");

const urlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

function normalizeSize(size = 21) {
  const numeric = Number(size);
  if (!Number.isFinite(numeric)) return 21;
  return Math.max(0, Math.floor(numeric));
}

function random(size) {
  const bytes = Buffer.allocUnsafe(normalizeSize(size));
  randomFillSync(bytes);
  return bytes;
}

function customRandom(alphabet, defaultSize, getRandom) {
  const chars = String(alphabet);
  if (chars.length === 0) throw new Error("Alphabet must not be empty");
  return (size = defaultSize) => {
    const bytes = getRandom(normalizeSize(size));
    let id = "";
    for (let i = 0; i < bytes.length; i++) id += chars[bytes[i] % chars.length];
    return id;
  };
}

function customAlphabet(alphabet, defaultSize = 21) {
  return customRandom(alphabet, defaultSize, random);
}

function nanoid(size = 21) {
  const bytes = random(size);
  let id = "";
  for (let i = 0; i < bytes.length; i++) id += urlAlphabet[bytes[i] & 63];
  return id;
}

module.exports = nanoid;
module.exports.nanoid = nanoid;
module.exports.customAlphabet = customAlphabet;
module.exports.customRandom = customRandom;
module.exports.random = random;
module.exports.urlAlphabet = urlAlphabet;
