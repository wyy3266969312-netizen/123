import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LICENSE_REVALIDATE_AFTER_DAYS,
  LICENSE_STORAGE_KEY,
  activateLicense,
  activeLicenseKey,
  clearActivation,
  loadActivation,
  needsRevalidation,
  revalidateActivation,
  saveActivation,
  type LicenseActivation,
} from "./license";
import { issueLicenseKey } from "../api/license-core";
import { TEST_LICENSE_SECRET } from "./licenseTestSupport";

const VALID_KEY = issueLicenseKey(TEST_LICENSE_SECRET);

function activation(patch: Partial<LicenseActivation> = {}): LicenseActivation {
  return {
    key: VALID_KEY,
    serial: "ABCDEFGH",
    activatedAt: "2026-08-01T00:00:00.000Z",
    verifiedAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("stored activation", () => {
  it("round-trips through localStorage", () => {
    saveActivation(activation());
    expect(loadActivation()).toEqual(activation());
    expect(activeLicenseKey()).toBe(VALID_KEY);
  });

  it("reports no key when nothing is stored", () => {
    expect(loadActivation()).toBeNull();
    expect(activeLicenseKey()).toBe("");
  });

  it("ignores a record whose key is not a license key", () => {
    window.localStorage.setItem(
      LICENSE_STORAGE_KEY,
      JSON.stringify({ key: "not-a-key" }),
    );

    expect(loadActivation()).toBeNull();
  });

  it("discards an unparseable record instead of throwing", () => {
    window.localStorage.setItem(LICENSE_STORAGE_KEY, "{oops");

    expect(loadActivation()).toBeNull();
    expect(window.localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull();
  });

  it("clears on request", () => {
    saveActivation(activation());
    clearActivation();
    expect(loadActivation()).toBeNull();
  });
});

describe("needsRevalidation", () => {
  it("waits out the trust window before re-checking", () => {
    const verifiedAt = new Date("2026-08-01T00:00:00.000Z");
    const justBefore = new Date(
      verifiedAt.getTime() + (LICENSE_REVALIDATE_AFTER_DAYS - 1) * 86_400_000,
    );
    const after = new Date(
      verifiedAt.getTime() + LICENSE_REVALIDATE_AFTER_DAYS * 86_400_000,
    );

    expect(needsRevalidation(activation(), justBefore)).toBe(false);
    expect(needsRevalidation(activation(), after)).toBe(true);
  });

  it("re-checks when the timestamp is missing or unreadable", () => {
    expect(needsRevalidation(activation({ verifiedAt: "" }))).toBe(true);
    expect(needsRevalidation(activation({ verifiedAt: "someday" }))).toBe(true);
  });
});

describe("activateLicense", () => {
  it("stores the activation the server returns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          valid: true,
          key: VALID_KEY,
          serial: "ABCDEFGH",
          verifiedAt: "2026-08-26T00:00:00.000Z",
        }),
      ),
    );

    const result = await activateLicense(VALID_KEY.toLowerCase());

    expect(result).toEqual({
      ok: true,
      activation: {
        key: VALID_KEY,
        serial: "ABCDEFGH",
        activatedAt: "2026-08-26T00:00:00.000Z",
        verifiedAt: "2026-08-26T00:00:00.000Z",
      },
    });
    expect(loadActivation()?.key).toBe(VALID_KEY);
  });

  it("rejects a malformed key without calling the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await activateLicense("SOP-ABCD");

    expect(result).toEqual({
      ok: false,
      error: "卡密格式不对，请检查是否复制完整。",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server's message and stores nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(403, { error: "该卡密已被停用。" })),
    );

    const result = await activateLicense(VALID_KEY);

    expect(result).toEqual({ ok: false, error: "该卡密已被停用。" });
    expect(loadActivation()).toBeNull();
  });

  it("explains a network failure instead of blaming the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const result = await activateLicense(VALID_KEY);

    expect(result).toEqual({
      ok: false,
      error: "无法连接服务器，请检查网络后重试。",
    });
  });

  it("does not choke when a misconfigured deployment answers with HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<!doctype html><h1>404</h1>", { status: 404 }),
      ),
    );

    const result = await activateLicense(VALID_KEY);

    expect(result.ok).toBe(false);
  });
});

describe("revalidateActivation", () => {
  it("refreshes the timestamp when the key is still good", async () => {
    saveActivation(activation());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          valid: true,
          key: VALID_KEY,
          serial: "ABCDEFGH",
          verifiedAt: "2026-09-01T00:00:00.000Z",
        }),
      ),
    );

    const outcome = await revalidateActivation(activation());

    expect(outcome).toEqual({
      status: "renewed",
      activation: activation({ verifiedAt: "2026-09-01T00:00:00.000Z" }),
    });
    expect(loadActivation()?.verifiedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("locks the app and clears storage when the key is rejected", async () => {
    saveActivation(activation());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(403, { error: "该卡密已被停用。" })),
    );

    const outcome = await revalidateActivation(activation());

    expect(outcome).toEqual({ status: "rejected", error: "该卡密已被停用。" });
    expect(loadActivation()).toBeNull();
  });

  it("keeps access when the server cannot be reached", async () => {
    saveActivation(activation());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    expect(await revalidateActivation(activation())).toEqual({
      status: "unreachable",
    });
    expect(loadActivation()).not.toBeNull();
  });

  it("keeps access through a rate limit or a server fault", async () => {
    saveActivation(activation());

    for (const status of [429, 500, 502]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(status, { error: "busy" })),
      );

      expect(await revalidateActivation(activation())).toEqual({
        status: "unreachable",
      });
      expect(loadActivation()).not.toBeNull();
    }
  });
});
