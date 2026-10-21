/**
 * License key shape, shared by the browser and the serverless functions.
 *
 * A key looks like `SOP-A2BC-D3EF-GH4J-KMN5-PQR6`: an 8-character serial that
 * identifies the purchase, followed by a 12-character signature derived from
 * the serial and the server's signing secret. Verification is therefore
 * stateless — there is no database of sold keys, the signature itself is the
 * proof of purchase.
 *
 * This module deliberately contains no crypto, so the paywall UI can import it
 * without pulling `node:crypto` into the browser bundle. Signing and
 * verification live in `api/license-core.ts`, which is server-only and keeps
 * its own copy of these helpers — see the note there.
 */

/**
 * 30 characters, chosen so a key can be read aloud or retyped from a chat
 * message: `I`, `L`, `O`, `U`, `0`, and `1` are all left out.
 */
export const LICENSE_KEY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export const LICENSE_KEY_PREFIX = "SOP";
export const LICENSE_SERIAL_LENGTH = 8;
export const LICENSE_SIGNATURE_LENGTH = 12;
export const LICENSE_KEY_LENGTH =
  LICENSE_SERIAL_LENGTH + LICENSE_SIGNATURE_LENGTH;

const GROUP_SIZE = 4;

/**
 * Reduce anything the user pasted — with or without the prefix, dashes,
 * spaces, or lowercase — to the bare 20 alphabet characters.
 */
export function normalizeLicenseKey(raw: string): string {
  const upper = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = upper.startsWith(LICENSE_KEY_PREFIX)
    ? upper.slice(LICENSE_KEY_PREFIX.length)
    : upper;

  return Array.from(body)
    .filter((character) => LICENSE_KEY_ALPHABET.includes(character))
    .join("");
}

/** The display form: prefix plus dash-separated groups of four. */
export function formatLicenseKey(normalized: string): string {
  const groups: string[] = [];
  for (let index = 0; index < normalized.length; index += GROUP_SIZE) {
    groups.push(normalized.slice(index, index + GROUP_SIZE));
  }

  return [LICENSE_KEY_PREFIX, ...groups].join("-");
}

/** Cheap shape check, so an obviously wrong key never costs a round trip. */
export function looksLikeLicenseKey(normalized: string): boolean {
  return normalized.length === LICENSE_KEY_LENGTH;
}

export type LicenseKeyParts = {
  serial: string;
  signature: string;
};

export function splitLicenseKey(normalized: string): LicenseKeyParts | null {
  if (!looksLikeLicenseKey(normalized)) return null;

  return {
    serial: normalized.slice(0, LICENSE_SERIAL_LENGTH),
    signature: normalized.slice(LICENSE_SERIAL_LENGTH),
  };
}
