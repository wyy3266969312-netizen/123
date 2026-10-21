/**
 * Paywall state for the browser: one purchase, one key, kept in
 * `localStorage` so the buyer types it once.
 *
 * The key itself is the credential — `/api/verify-license` checks its
 * signature and answers, storing nothing. So "activated" here just means "we
 * have a key the server accepted recently", and the same key is re-sent on
 * every paid API call.
 *
 * License storage is deliberately independent of Safe Demo Mode: the demo is
 * the free preview and bypasses the gate entirely, and a demo session must
 * never be able to clear a paying user's activation.
 */
import {
  formatLicenseKey,
  looksLikeLicenseKey,
  normalizeLicenseKey,
} from "./licenseKeyFormat";

export const LICENSE_STORAGE_KEY = "tiktok-creator-sop-tool.license.v1";

/** How long an activation is trusted before the app quietly re-checks it. */
export const LICENSE_REVALIDATE_AFTER_DAYS = 14;

export const VERIFY_LICENSE_ENDPOINT = "/api/verify-license";

/**
 * Whether the paywall applies at all. `vite dev` does not serve `/api`, so a
 * key could never be verified while developing — gating there would only lock
 * the developer out of their own app. The gate is a production build concern.
 */
export function isLicenseGateActive(): boolean {
  return import.meta.env.PROD;
}

export type LicenseActivation = {
  /** Display form, e.g. `SOP-A2BC-D3EF-GH4J-KMN5-PQR6`. */
  key: string;
  serial: string;
  activatedAt: string;
  verifiedAt: string;
};

export type ActivationResult =
  { ok: true; activation: LicenseActivation } | { ok: false; error: string };

const MALFORMED_KEY_ERROR = "卡密格式不对，请检查是否复制完整。";
const UNREACHABLE_ERROR = "无法连接服务器，请检查网络后重试。";

function readStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Private browsing and blocked third-party storage both throw here.
    return null;
  }
}

export function loadActivation(): LicenseActivation | null {
  const storage = readStorage();
  const saved = storage?.getItem(LICENSE_STORAGE_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as Partial<LicenseActivation>;
    if (!parsed?.key || !looksLikeLicenseKey(normalizeLicenseKey(parsed.key))) {
      return null;
    }

    return {
      key: parsed.key,
      serial: parsed.serial ?? "",
      activatedAt: parsed.activatedAt ?? "",
      verifiedAt: parsed.verifiedAt ?? "",
    };
  } catch {
    storage?.removeItem(LICENSE_STORAGE_KEY);
    return null;
  }
}

export function saveActivation(activation: LicenseActivation): void {
  try {
    readStorage()?.setItem(LICENSE_STORAGE_KEY, JSON.stringify(activation));
  } catch {
    // A full or unavailable store only means the buyer re-enters the key next
    // visit; it must not break the session they are already in.
  }
}

export function clearActivation(): void {
  try {
    readStorage()?.removeItem(LICENSE_STORAGE_KEY);
  } catch {
    // Nothing to do — the activation simply stays until storage recovers.
  }
}

/** The key to attach to paid API calls, or `""` when the app is not activated. */
export function activeLicenseKey(): string {
  return loadActivation()?.key ?? "";
}

export function needsRevalidation(
  activation: LicenseActivation,
  now: Date = new Date(),
): boolean {
  const verifiedAt = Date.parse(activation.verifiedAt);
  if (!Number.isFinite(verifiedAt)) return true;

  const elapsedDays = (now.getTime() - verifiedAt) / 86_400_000;
  return elapsedDays >= LICENSE_REVALIDATE_AFTER_DAYS;
}

type VerifyResponse = {
  valid?: boolean;
  key?: string;
  serial?: string;
  verifiedAt?: string;
  error?: string;
};

/**
 * `null` means the server could not be reached, which is deliberately not the
 * same as "invalid": a buyer offline on a plane keeps their access.
 */
async function postKey(
  key: string,
): Promise<{ reached: true; response: Response; body: VerifyResponse } | null> {
  try {
    const response = await fetch(VERIFY_LICENSE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    // A misconfigured deployment can answer with HTML instead of JSON, so the
    // body is parsed defensively rather than assumed.
    const raw = await response.text();
    let body: VerifyResponse = {};
    try {
      body = JSON.parse(raw) as VerifyResponse;
    } catch {
      body = {};
    }

    return { reached: true, response, body };
  } catch {
    return null;
  }
}

/** Exchange a typed-in key for a stored activation. */
export async function activateLicense(
  rawKey: string,
  now: Date = new Date(),
): Promise<ActivationResult> {
  const normalized = normalizeLicenseKey(rawKey);
  if (!looksLikeLicenseKey(normalized)) {
    return { ok: false, error: MALFORMED_KEY_ERROR };
  }

  const result = await postKey(normalized);
  if (!result) return { ok: false, error: UNREACHABLE_ERROR };

  const { response, body } = result;
  if (!response.ok || !body.valid) {
    return { ok: false, error: body.error || "卡密无效，请检查后重新输入。" };
  }

  const timestamp = body.verifiedAt || now.toISOString();
  const activation: LicenseActivation = {
    key: body.key || formatLicenseKey(normalized),
    serial: body.serial ?? "",
    activatedAt: timestamp,
    verifiedAt: timestamp,
  };

  saveActivation(activation);
  return { ok: true, activation };
}

export type RevalidationOutcome =
  | { status: "renewed"; activation: LicenseActivation }
  | { status: "rejected"; error: string }
  | { status: "unreachable" };

/**
 * Re-check a stored activation. Only an explicit rejection from the server
 * locks the app again — this is how a refunded or leaked key is taken back
 * without keeping a session store.
 */
export async function revalidateActivation(
  activation: LicenseActivation,
  now: Date = new Date(),
): Promise<RevalidationOutcome> {
  const result = await postKey(normalizeLicenseKey(activation.key));
  if (!result) return { status: "unreachable" };

  const { response, body } = result;
  if (response.status === 401 || response.status === 403) {
    clearActivation();
    return { status: "rejected", error: body.error || "卡密已失效。" };
  }

  if (!response.ok || !body.valid) {
    // 429, 500, and anything else is a server-side problem, not the buyer's.
    return { status: "unreachable" };
  }

  const renewed: LicenseActivation = {
    ...activation,
    key: body.key || activation.key,
    serial: body.serial || activation.serial,
    verifiedAt: body.verifiedAt || now.toISOString(),
  };

  saveActivation(renewed);
  return { status: "renewed", activation: renewed };
}
