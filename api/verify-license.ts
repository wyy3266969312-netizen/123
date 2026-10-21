import {
  MISSING_LICENSE_ERROR,
  MISSING_LICENSE_SECRET_ERROR,
  formatLicenseKey,
  licenseFailureFor,
  normalizeLicenseKey,
  parseRevokedSerials,
  verifyLicenseKey,
} from "./license-core.js";
/**
 * Checks a license key and, when it is genuine, tells the browser it may
 * unlock. There is no session and nothing is stored: the key's own signature
 * is the proof, so the browser keeps the key and re-presents it later.
 */

type VerifyLicenseRequest = {
  key?: string;
};

type ServerlessRequest = {
  method?: string;
  body?: VerifyLicenseRequest | string;
  headers?: Record<string, string | string[] | undefined>;
};

type ServerlessResponse = {
  status: (statusCode: number) => ServerlessResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

/**
 * A signature is 12 characters over a 30-character alphabet, so guessing one
 * is not realistic — but an unthrottled endpoint still invites someone to try,
 * and every attempt costs a function invocation. The window is per warm
 * instance rather than global, which is enough to make guessing pointless
 * without adding a datastore the rest of the design does without.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 12;

type RateLimitEntry = { count: number; windowStartedAt: number };

const rateLimitBuckets = new Map<string, RateLimitEntry>();

function clientKeyFor(headers: ServerlessRequest["headers"]): string {
  const forwarded = headers?.["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (value ?? "unknown").split(",")[0].trim() || "unknown";
}

export function isRateLimited(
  client: string,
  now: number = Date.now(),
): boolean {
  const entry = rateLimitBuckets.get(client);
  if (!entry || now - entry.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(client, { count: 1, windowStartedAt: now });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function parseRequestBody(
  body: ServerlessRequest["body"],
): VerifyLicenseRequest {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as VerifyLicenseRequest;
    } catch {
      return {};
    }
  }

  return body ?? {};
}

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader?.("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const secret = (process.env.LICENSE_SIGNING_SECRET ?? "").trim();
  if (!secret) {
    res.status(500).json({ error: MISSING_LICENSE_SECRET_ERROR });
    return;
  }

  if (isRateLimited(clientKeyFor(req.headers))) {
    res.status(429).json({ error: "尝试次数过多，请稍后再试。" });
    return;
  }

  const normalized = normalizeLicenseKey(parseRequestBody(req.body).key ?? "");
  if (!normalized) {
    res.status(400).json({ error: MISSING_LICENSE_ERROR });
    return;
  }

  const verification = verifyLicenseKey(
    normalized,
    secret,
    parseRevokedSerials(process.env.LICENSE_REVOKED_SERIALS),
  );
  const failure = licenseFailureFor(verification);
  if (failure || !verification.valid) {
    const { status, error } = failure ?? {
      status: 401,
      error: MISSING_LICENSE_ERROR,
    };
    res.status(status).json({ error });
    return;
  }

  res.status(200).json({
    valid: true,
    key: formatLicenseKey(normalized),
    serial: verification.serial,
    verifiedAt: new Date().toISOString(),
  });
}
