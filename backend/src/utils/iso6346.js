/**
 * Validation ISO 6346 (4 lettres + 6 chiffres + check digit).
 */
const ISO_FULL = /^[A-Z]{4}\d{7}$/;

const LETTER_VALUES = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

function normalizeCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function computeCheckDigit(firstTen) {
  if (firstTen.length !== 10) return null;
  let total = 0;
  for (let i = 0; i < 10; i += 1) {
    const ch = firstTen[i];
    const val = /\d/.test(ch) ? Number(ch) : LETTER_VALUES[ch];
    if (val == null) return null;
    total += val * 2 ** i;
  }
  const rem = total % 11;
  return rem === 10 ? '0' : String(rem);
}

function isIsoFormat(code) {
  return ISO_FULL.test(normalizeCode(code));
}

function isoValid(code) {
  const n = normalizeCode(code);
  if (!ISO_FULL.test(n)) return false;
  return n[10] === computeCheckDigit(n.slice(0, 10));
}

function cautiousOcrFix(raw) {
  const n = normalizeCode(raw);
  if (n.length !== 11) return n;
  const owner = n.slice(0, 4).replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B');
  const digits = n.slice(4).replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8');
  return `${owner}${digits}`;
}

module.exports = { normalizeCode, isIsoFormat, isoValid, computeCheckDigit, cautiousOcrFix };
