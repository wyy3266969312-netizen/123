/**
 * Server-side account checks, and the combined guard the paid routes use.
 *
 * Two credentials now open the same door: a license key sold before accounts
 * existed, or a signed-in account the seller has approved. Neither replaces
 * the other — every key already sold keeps working, so shipping accounts does
 * not strand a single buyer.
 *
 * Like `license-core.ts`, this file imports nothing from outside `api/` and
 * reaches its neighbour as `./license-core.js`. Both halves matter: this
 * package is `"type": "module"`, so an extensionless relative specifier throws
 * ERR_MODULE_NOT_FOUND before the handler runs, and a path climbing out of
 * `api/` is never emitted at all. Getting either wrong takes down every
 * function on the deployment while the build stays green.
 */
import {
  MISSING_LICENSE_SECRET_ERROR,
  checkRequestLicense,
  readLicenseHeader,
  type LicenseFailure,
  type ServerlessHeaders,
} from "./license-core.js";

/** Header the browser sends its Supabase access token in. */
export const ACCOUNT_HEADER = "authorization";

export const NOT_SIGNED_IN_ERROR = "未激活：请先登录，或输入卡密。";
export const SESSION_EXPIRED_ERROR = "登录已过期，请重新登录。";
export const NOT_APPROVED_ERROR =
  "账号还没开通。请联系微信 el_hazel 完成付款后开通。";
export const ACCOUNTS_UNCONFIGURED_ERROR = "本部署未启用账号功能。";

export type AccountCheck =
  { ok: true; userId: string } | { ok: false; status: number; error: string };

export function readBearerToken(headers: ServerlessHeaders): string {
  const raw = headers?.[ACCOUNT_HEADER] ?? headers?.["Authorization"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "";

  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1].trim() : "";
}

function supabaseConfig(env: NodeJS.ProcessEnv) {
  return {
    url: (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "")
      .trim()
      .replace(/\/$/, ""),
    secret: (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
  };
}

/**
 * Resolve an access token to an approved user.
 *
 * The token is checked against Supabase rather than decoded here: only
 * Supabase can say whether it is genuine, unexpired, and not revoked, and a
 * signature check written locally is one more thing that can be subtly wrong.
 * Approval is then read with the secret key, because the whole point is that
 * the user's own credentials cannot see or change that flag.
 */
export async function verifyAccountAccess(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AccountCheck> {
  const { url, secret } = supabaseConfig(env);
  if (!url || !secret) {
    return { ok: false, status: 500, error: ACCOUNTS_UNCONFIGURED_ERROR };
  }

  if (!token) {
    return { ok: false, status: 401, error: NOT_SIGNED_IN_ERROR };
  }

  let userId: string;
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: secret, Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return { ok: false, status: 401, error: SESSION_EXPIRED_ERROR };
    }

    const user = (await response.json()) as { id?: string };
    userId = typeof user.id === "string" ? user.id : "";
  } catch {
    return { ok: false, status: 502, error: "无法连接账号服务，请稍后重试。" };
  }

  if (!userId) {
    return { ok: false, status: 401, error: SESSION_EXPIRED_ERROR };
  }

  try {
    const response = await fetch(
      `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=approved`,
      { headers: { apikey: secret, Authorization: `Bearer ${secret}` } },
    );

    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        error: "无法读取账号状态，请稍后重试。",
      };
    }

    const rows = (await response.json()) as Array<{ approved?: boolean }>;
    if (!Array.isArray(rows) || rows[0]?.approved !== true) {
      return { ok: false, status: 403, error: NOT_APPROVED_ERROR };
    }
  } catch {
    return { ok: false, status: 502, error: "无法读取账号状态，请稍后重试。" };
  }

  return { ok: true, userId };
}

/**
 * `null` means the request may proceed. A caller passes either credential and
 * only needs one to hold.
 *
 * When both are absent the license message is the one returned, because a
 * deployment without Supabase configured still sells keys and that is the
 * older, wider audience. When a key was presented and rejected, that rejection
 * wins over any account error: the buyer clearly meant to use the key, and
 * telling them to sign in instead would be nonsense.
 */
export async function checkPaidRequest(
  headers: ServerlessHeaders,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LicenseFailure | null> {
  const presentedKey = readLicenseHeader(headers).trim();
  if (presentedKey) {
    const licenseFailure = checkRequestLicense(headers, env);
    // A misconfigured signing secret is the deployment's fault, not the
    // buyer's, and an account may still get them in.
    if (
      !licenseFailure ||
      licenseFailure.error !== MISSING_LICENSE_SECRET_ERROR
    ) {
      return licenseFailure;
    }
  }

  const token = readBearerToken(headers);
  const account = await verifyAccountAccess(token, env);
  if (account.ok) return null;

  // Nothing was presented at all: answer in terms of both ways in.
  if (!presentedKey && !token) {
    return { status: 401, error: NOT_SIGNED_IN_ERROR };
  }

  return { status: account.status, error: account.error };
}

/**
 * This module sits in `api/`, so the platform may expose it as a route. It has
 * no business being called; the default export makes that an honest 404 rather
 * than a build error about a missing handler.
 */
export default function handler(
  _req: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } },
): void {
  res.status(404).json({ error: "Not Found" });
}
