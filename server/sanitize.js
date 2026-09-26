// Strips secrets / hashes before anything leaves the server. Everything the
// analytics UI shows passes through here.
const SENSITIVE_KEYS = new Set([
  'passwordHash', 'mpinHash', 'mpinVault', 'passwordResetNonceHash', 'passwordResetExpiresAt',
  'eInvoicePasswordEnc', 'eInvoiceUsername', 'otp', 'webhookSecret', 'signature',
  'razorpaySignature', 'payloadHash', 'msg91Response', '__v',
]);

function sanitize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId' && typeof value.toHexString === 'function') return value.toHexString();
    if (value._bsontype) return String(value);
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) continue;
      if (key === 'bankAccountNumber' && typeof val === 'string' && val.length > 4) {
        out[key] = '****' + val.slice(-4);
        continue;
      }
      out[key] = sanitize(val);
    }
    return out;
  }
  return value;
}

module.exports = { sanitize };
