/**
 * Every piece of license logic the serverless functions need, in one file that
 * lives *inside* `api/`.
 *
 * Why it is here and not in `src/`: an earlier version imported this from
 * `../src/licenseServer`, and Vercel compiled the route entrypoints without
 * emitting the `src/` modules they pulled in. The build passed, then every
 * function died at invocation with FUNCTION_INVOCATION_FAILED — including the
 * two AI routes that had worked for months. Keeping the import a plain
 * same-directory `./license-core` removes any dependency on how the platform
 * decides to trace and bundle files outside the functions directory.
 *
 * The cost is that the key *format* helpers exist twice: here, and in
 * `src/licenseKeyFormat.ts` for the browser, which must not pull `node:crypto`
 * into the client bundle. `licenseCoreParity.test.ts` compares the two on
 * every input it can think of, so a change to one that is not mirrored in the
 * other fails CI rather than shipping.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 30 characters: no `I`, `L`, `O`, `U`, `0`, or `1`, so a key survives being
 * retyped from a chat message. Must match `src/licenseKeyFormat.ts`. */
export const LICENSE_KEY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export const LICENSE_KEY_PREFIX = "SOP";
export const LICENSE_SERIAL_LENGTH = 8;
export const LICENSE_SIGNATURE_LENGTH = 12;
export const LICENSE_KEY_LENGTH =
  LICENSE_SERIAL_LENGTH + LICENSE_SIGNATURE_LENGTH;

const GROUP_SIZE = 4;

export function normalizeLicenseKey(raw: string): string {
  const upper = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = upper.startsWith(LICENSE_KEY_PREFIX)
    ? upper.slice(LICENSE_KEY_PREFIX.length)
    : upper;

  return Array.from(body)
    .filter((character) => LICENSE_KEY_ALPHABET.includes(character))
    .join("");
}

export function formatLicenseKey(normalized: string): string {
  const groups: string[] = [];
  for (let index = 0; index < normalized.length; index += GROUP_SIZE) {
    groups.push(normalized.slice(index, index + GROUP_SIZE));
  }

  return [LICENSE_KEY_PREFIX, ...groups].join("-");
}

export function looksLikeLicenseKey(normalized: string): boolean {
  return normalized.length === LICENSE_KEY_LENGTH;
}

export type LicenseKeyParts = { serial: string; signature: string };

export function splitLicenseKey(normalized: string): LicenseKeyParts | null {
  if (!looksLikeLicenseKey(normalized)) return null;

  return {
    serial: normalized.slice(0, LICENSE_SERIAL_LENGTH),
    signature: normalized.slice(LICENSE_SERIAL_LENGTH),
  };
}

/** Map raw bytes onto the key alphabet, one character per byte. */
function encodeToAlphabet(bytes: Uint8Array, length: number): string {
  let encoded = "";
  for (let index = 0; index < length; index += 1) {
    encoded += LICENSE_KEY_ALPHABET[bytes[index] % LICENSE_KEY_ALPHABET.length];
  }

  return encoded;
}

export function signSerial(serial: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(serial).digest();
  return encodeToAlphabet(digest, LICENSE_SIGNATURE_LENGTH);
}

/** Mint a key. The caller authenticates first — see `issue-license.ts`. */
export function issueLicenseKey(secret: string): string {
  const serial = encodeToAlphabet(
    randomBytes(LICENSE_SERIAL_LENGTH),
    LICENSE_SERIAL_LENGTH,
  );

  return formatLicenseKey(`${serial}${signSerial(serial, secret)}`);
}

export type LicenseVerification =
  | { valid: true; serial: string }
  | { valid: false; reason: "malformed" | "signature" | "revoked" };

function signaturesMatch(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  if (expectedBytes.length !== providedBytes.length) return false;

  return timingSafeEqual(expectedBytes, providedBytes);
}

/** `LICENSE_REVOKED_SERIALS`: a comma or whitespace separated list. */
export function parseRevokedSerials(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .toUpperCase()
      .split(/[\s,]+/)
      .map((serial) => serial.trim())
      .filter((serial) => serial.length === LICENSE_SERIAL_LENGTH),
  );
}

export function verifyLicenseKey(
  raw: string,
  secret: string,
  revokedSerials: Set<string> = new Set(),
): LicenseVerification {
  const parts = splitLicenseKey(normalizeLicenseKey(raw));
  if (!parts) return { valid: false, reason: "malformed" };

  if (!signaturesMatch(signSerial(parts.serial, secret), parts.signature)) {
    return { valid: false, reason: "signature" };
  }

  if (revokedSerials.has(parts.serial)) {
    return { valid: false, reason: "revoked" };
  }

  return { valid: true, serial: parts.serial };
}

/* ---------------------------------------------------------------- request */

export const LICENSE_HEADER = "x-license-key";

export const MISSING_LICENSE_SECRET_ERROR =
  "服务端未配置 LICENSE_SIGNING_SECRET，无法校验卡密。";
export const MISSING_LICENSE_ERROR = "未激活：请先输入卡密。";
export const INVALID_LICENSE_ERROR = "卡密无效，请检查后重新输入。";
export const REVOKED_LICENSE_ERROR = "该卡密已被停用，请联系购买渠道。";

export type ServerlessHeaders =
  Record<string, string | string[] | undefined> | undefined;

export type LicenseFailure = { status: number; error: string };

export function readLicenseHeader(headers: ServerlessHeaders): string {
  const raw =
    headers?.[LICENSE_HEADER] ?? headers?.[LICENSE_HEADER.toUpperCase()];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return typeof raw === "string" ? raw : "";
}

export function licenseFailureFor(
  verification: LicenseVerification,
): LicenseFailure | null {
  if (verification.valid) return null;

  if (verification.reason === "revoked") {
    return { status: 403, error: REVOKED_LICENSE_ERROR };
  }

  return { status: 401, error: INVALID_LICENSE_ERROR };
}

/**
 * `null` means the request may proceed. Anything else is the exact status and
 * message to answer with. The paid AI routes call this before spending money.
 */
export function checkRequestLicense(
  headers: ServerlessHeaders,
  env: NodeJS.ProcessEnv = process.env,
): LicenseFailure | null {
  const secret = (env.LICENSE_SIGNING_SECRET ?? "").trim();
  if (!secret) return { status: 500, error: MISSING_LICENSE_SECRET_ERROR };

  const key = readLicenseHeader(headers).trim();
  if (!key) return { status: 401, error: MISSING_LICENSE_ERROR };

  return licenseFailureFor(
    verifyLicenseKey(
      key,
      secret,
      parseRevokedSerials(env.LICENSE_REVOKED_SERIALS),
    ),
  );
}

/**
 * This module sits in `api/`, so the platform may expose it as a route. It has
 * no business being called — the default export exists so that, if it is, the
 * answer is an honest 404 rather than a build error about a missing handler.
 */
export default function handler(
  _req: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } },
): void {
  res.status(404).json({ error: "Not Found" });
}
