const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const bcrypt = require("bcrypt");
const { encryptSecret, decryptSecret, generateBackupCodes } = require("../utils/crypto");

/* authenticator defaults (30s step, 6 digits) match every standard app —
   Google Authenticator, Authy, 1Password, etc. — no config needed. */

function generateEnrollmentSecret(email) {
  const secret = authenticator.generateSecret();
  const issuer = process.env.TOTP_ISSUER || "Taskify";
  const otpauthUrl = authenticator.keyuri(email, issuer, secret);
  return { secret, otpauthUrl };
}

async function generateQrCodeDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl);
}

function verifyCode(encryptedSecret, code) {
  if (!code || !/^\d{6}$/.test(String(code).trim())) return false;
  try {
    const secret = decryptSecret(encryptedSecret);
    return authenticator.check(String(code).trim(), secret);
  } catch {
    return false;
  }
}

function encryptSecretForStorage(rawSecret) {
  return encryptSecret(rawSecret);
}

/* Backup codes are shown to the user exactly once at generation time, then
   only their bcrypt hashes are stored (same treatment as a password — a DB
   leak shouldn't hand out working codes). */
async function generateHashedBackupCodes() {
  const plainCodes = generateBackupCodes(10);
  const hashed = await Promise.all(plainCodes.map((code) => bcrypt.hash(code, 10)));
  return { plainCodes, hashed: hashed.map((hash) => ({ hash, used: false })) };
}

async function consumeBackupCode(storedCodes, suppliedCode) {
  if (!suppliedCode || !Array.isArray(storedCodes)) return null;
  const normalized = String(suppliedCode).trim().toUpperCase();

  for (let i = 0; i < storedCodes.length; i++) {
    const entry = storedCodes[i];
    if (entry.used) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(normalized, entry.hash)) {
      const updated = [...storedCodes];
      updated[i] = { ...entry, used: true };
      return updated;
    }
  }
  return null;
}

module.exports = {
  generateEnrollmentSecret,
  generateQrCodeDataUrl,
  verifyCode,
  encryptSecretForStorage,
  generateHashedBackupCodes,
  consumeBackupCode
};
