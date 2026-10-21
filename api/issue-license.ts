/**
 * Mints license keys. This is the seller's own tool, not something the app
 * calls: after a buyer pays, hit this endpoint with the admin token and send
 * them the key that comes back.
 *
 *   curl -X POST https://<deployment>/api/issue-license \
 *     -H "x-admin-token: $LICENSE_ADMIN_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"count":1,"note":"wechat 2026-08-26"}'
 *
 * Nothing is stored, so `note` is echoed back only to help you paste the key
 * and the buyer together into your own records.
 */
import { timingSafeEqual } from "node:crypto";
import {
  MISSING_LICENSE_SECRET_ERROR,
  issueLicenseKey,
} from "./license-core.js";

type IssueLicenseRequest = {
  count?: number;
  note?: string;
};

type ServerlessRequest = {
  method?: string;
  body?: IssueLicenseRequest | string;
  headers?: Record<string, string | string[] | undefined>;
};

type ServerlessResponse = {
  status: (statusCode: number) => ServerlessResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

const ADMIN_TOKEN_HEADER = "x-admin-token";
const MISSING_ADMIN_TOKEN_ERROR =
  "服务端未配置 LICENSE_ADMIN_TOKEN，发卡接口已关闭。";
const MAX_KEYS_PER_REQUEST = 50;

function parseRequestBody(
  body: ServerlessRequest["body"],
): IssueLicenseRequest {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as IssueLicenseRequest;
    } catch {
      return {};
    }
  }

  return body ?? {};
}

function readHeader(
  headers: ServerlessRequest["headers"],
  name: string,
): string {
  const raw = headers?.[name] ?? headers?.[name.toUpperCase()];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return typeof raw === "string" ? raw : "";
}

export function tokensMatch(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  if (expectedBytes.length !== providedBytes.length) return false;

  return timingSafeEqual(expectedBytes, providedBytes);
}

/** Clamp to a whole number of keys in `[1, MAX_KEYS_PER_REQUEST]`. */
export function normalizeCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;

  return Math.min(Math.max(Math.floor(parsed), 1), MAX_KEYS_PER_REQUEST);
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

  const adminToken = (process.env.LICENSE_ADMIN_TOKEN ?? "").trim();
  if (!adminToken) {
    res.status(500).json({ error: MISSING_ADMIN_TOKEN_ERROR });
    return;
  }

  if (
    !tokensMatch(adminToken, readHeader(req.headers, ADMIN_TOKEN_HEADER).trim())
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const secret = (process.env.LICENSE_SIGNING_SECRET ?? "").trim();
  if (!secret) {
    res.status(500).json({ error: MISSING_LICENSE_SECRET_ERROR });
    return;
  }

  const { count, note } = parseRequestBody(req.body);
  const keys = Array.from({ length: normalizeCount(count) }, () =>
    issueLicenseKey(secret),
  );

  res.status(200).json({
    keys,
    note: typeof note === "string" ? note : "",
    issuedAt: new Date().toISOString(),
  });
}
