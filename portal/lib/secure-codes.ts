import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generates a cryptographically secure uppercase alphanumeric voucher code.
 * Uses node:crypto.randomInt() — server-only module (never import from 'use client').
 */
export function generateSecureVoucherCode(len = 8): string {
  const length = Math.max(4, Math.floor(len));
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CODE_ALPHABET.charAt(crypto.randomInt(0, CODE_ALPHABET.length));
  }
  return result;
}

/**
 * Generates a cryptographically secure session transfer code (e.g. "PW-8K4M9X2Q").
 * Server-only module (never import from 'use client').
 */
export function generateSecureTransferCode(len = 8): string {
  return `PW-${generateSecureVoucherCode(len)}`;
}
