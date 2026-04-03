/**
 * @file jwt.ts
 * Lightweight JWT helper using the Web Crypto API (HS256).
 *
 * Policy note:
 * This JWT helper is a starter implementation for the current app shell. The
 * blueprint target is stricter: passkey-first auth, pinned algorithms by
 * deployment, revocation checks, delegated authority for consequential actions,
 * and sandbox-only credentials for digital twins.
 *
 * Security hardening (issue #129):
 * - JWT_SECRET absence is checked at server startup in index.ts; the server
 *   process exits before binding if the variable is not set.
 * - The CryptoKey is imported once at module scope so repeated sign/verify
 *   calls do not call crypto.subtle.importKey on every invocation.
 *   Re-import only occurs if JWT_SECRET changes between module evaluations
 *   (which is not expected in production but can happen in tests).
 */

/**
 * The raw secret used for HMAC signing.
 * Falls back to an insecure placeholder in non-production environments so that
 * unit and integration tests that import this module directly (without the
 * fail-fast guard in index.ts) can still run.  Production startup enforces the
 * presence of JWT_SECRET via index.ts before any request is served.
 */
const JWT_SECRET_KEY = process.env.JWT_SECRET || 'meshmargin-test-placeholder';
const ENCODER = new TextEncoder();

/**
 * Module-scoped CryptoKey promise. Resolved once at startup so that
 * signJwt and verifyJwt never call crypto.subtle.importKey more than once.
 */
const CRYPTO_KEY_PROMISE: Promise<CryptoKey> = crypto.subtle.importKey(
  'raw',
  ENCODER.encode(JWT_SECRET_KEY),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);

/**
 * Encodes a string to a Base64 URL Safe string.
 */
function base64UrlEncode(str: string | Uint8Array): string {
  const base64 = typeof str === 'string' ? btoa(str) : btoa(String.fromCharCode(...str));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes a Base64 URL Safe string.
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Signs a payload generating a JWT token natively using Web Crypto.
 * Uses the module-scoped CryptoKey — no re-import on every call.
 */
export async function signJwt(payload: object, expiresInHours = 24 * 7): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInHours * 60 * 60;

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify({ ...payload, exp }));

  const dataToSign = ENCODER.encode(`${encodedHeader}.${encodedPayload}`);
  const key = await CRYPTO_KEY_PROMISE;

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, dataToSign);
  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Verifies and decodes a JWT token. Throws if invalid or expired.
 * Uses the module-scoped CryptoKey — no re-import on every call.
 */
export async function verifyJwt<T>(token: string): Promise<T> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToSign = ENCODER.encode(`${encodedHeader}.${encodedPayload}`);

  const key = await CRYPTO_KEY_PROMISE;

  // Convert signature from base64url back to Uint8Array safely for verification
  let base64Sig = encodedSignature.replace(/-/g, '+').replace(/_/g, '/');
  while (base64Sig.length % 4) {
    base64Sig += '=';
  }
  const binaryString = atob(base64Sig);
  const signatureBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    signatureBytes[i] = binaryString.charCodeAt(i);
  }

  const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, dataToSign);
  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // The implementation uses a fixed HS256 header today. Consequential
  // transaction signatures should follow the blueprint rule instead: pin the
  // accepted algorithm per deployment / ledger domain, not per request.

  const payloadStr = base64UrlDecode(encodedPayload);
  const payload = JSON.parse(payloadStr);

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload as T;
}
