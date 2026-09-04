const crypto = require("crypto");

/*
  Shared crypto helpers for anything auth-security touches:
  - random opaque tokens (email verification, password reset) — we only
    ever store a hash of these, never the raw value, so a DB leak alone
    can't be used to verify emails or reset passwords.
  - AES-256-GCM encrypt/decrypt for the TOTP secret at rest.
*/

function generateRawToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function getEncryptionKey() {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("TOTP_ENCRYPTION_KEY is missing or invalid (must be a 64-char hex string).");
  }
  return Buffer.from(key, "hex");
}

function encryptSecret(plainText) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  /* iv:authTag:ciphertext, all hex, so it stores cleanly in a single VARCHAR column */
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptSecret(payload) {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, dataHex] = String(payload).split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

/* Random, human-typeable backup codes — grouped like XXXX-XXXX for readability. */
function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

module.exports = {
  generateRawToken,
  hashToken,
  encryptSecret,
  decryptSecret,
  generateBackupCodes
};
