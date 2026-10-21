import { afterEach, beforeEach, describe, expect, it } from "vitest";

import issueHandler from "../api/issue-license";
import verifyHandler from "../api/verify-license";
import deepSeekHandler from "../api/deepseek-reply";
import { normalizeLicenseKey, splitLicenseKey } from "./licenseKeyFormat";
import { issueLicenseKey, verifyLicenseKey } from "../api/license-core";
import {
  TEST_LICENSE_SECRET,
  clearTestLicenseSecret,
  testLicenseHeaders,
  useTestLicenseSecret,
} from "./licenseTestSupport";

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

/**
 * The verify endpoint rate-limits per client, and that counter lives for the
 * life of the module. Giving every test its own address keeps them from
 * spending each other's budget.
 */
let nextClient = 0;
function freshClientHeaders(extra: Record<string, string> = {}) {
  nextClient += 1;
  return { "x-forwarded-for": `203.0.113.${nextClient}`, ...extra };
}

beforeEach(() => {
  useTestLicenseSecret();
});

afterEach(() => {
  clearTestLicenseSecret();
  delete process.env.LICENSE_ADMIN_TOKEN;
  delete process.env.DEEPSEEK_API_KEY;
});

describe("verify-license API route", () => {
  it("accepts a genuine key and echoes it back in display form", async () => {
    const key = issueLicenseKey(TEST_LICENSE_SECRET);
    const res = createResponse();

    await verifyHandler(
      { method: "POST", headers: freshClientHeaders(), body: { key } },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      valid: true,
      key,
      serial: splitLicenseKey(normalizeLicenseKey(key))?.serial,
    });
  });

  it("accepts the key however the buyer pasted it", async () => {
    const key = issueLicenseKey(TEST_LICENSE_SECRET);
    const res = createResponse();

    await verifyHandler(
      {
        method: "POST",
        headers: freshClientHeaders(),
        body: { key: ` ${key.toLowerCase().replace(/-/g, "")} ` },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ valid: true, key });
  });

  it("rejects a forged key with 401 and no detail about why", async () => {
    const res = createResponse();

    await verifyHandler(
      {
        method: "POST",
        headers: freshClientHeaders(),
        body: { key: issueLicenseKey("not-the-real-secret") },
      },
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "卡密无效，请检查后重新输入。" });
  });

  it("rejects a revoked serial with 403 so a refund can be enforced", async () => {
    const key = issueLicenseKey(TEST_LICENSE_SECRET);
    process.env.LICENSE_REVOKED_SERIALS = splitLicenseKey(
      normalizeLicenseKey(key),
    )!.serial;
    const res = createResponse();

    await verifyHandler(
      { method: "POST", headers: freshClientHeaders(), body: { key } },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "该卡密已被停用，请联系购买渠道。" });
  });

  it("answers 400 when nothing usable was sent", async () => {
    const res = createResponse();

    await verifyHandler(
      { method: "POST", headers: freshClientHeaders(), body: { key: "  " } },
      res,
    );

    expect(res.statusCode).toBe(400);
  });

  it("fails closed when the deployment has no signing secret", async () => {
    clearTestLicenseSecret();
    const res = createResponse();

    await verifyHandler(
      {
        method: "POST",
        headers: freshClientHeaders(),
        body: { key: issueLicenseKey(TEST_LICENSE_SECRET) },
      },
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: "服务端未配置 LICENSE_SIGNING_SECRET，无法校验卡密。",
    });
  });

  it("throttles a client that keeps guessing", async () => {
    const headers = freshClientHeaders();
    const forged = issueLicenseKey("not-the-real-secret");
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 14; attempt += 1) {
      const res = createResponse();
      await verifyHandler(
        { method: "POST", headers, body: { key: forged } },
        res,
      );
      statuses.push(res.statusCode);
    }

    expect(statuses.slice(0, 12)).toEqual(Array(12).fill(401));
    expect(statuses.slice(12)).toEqual([429, 429]);
  });

  it("refuses anything but POST", async () => {
    const res = createResponse();

    await verifyHandler({ method: "GET", headers: freshClientHeaders() }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("POST");
  });
});

describe("issue-license API route", () => {
  it("mints keys that verify against the same secret", async () => {
    process.env.LICENSE_ADMIN_TOKEN = "admin-token";
    const res = createResponse();

    await issueHandler(
      {
        method: "POST",
        headers: { "x-admin-token": "admin-token" },
        body: { count: 3, note: "wechat" },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { keys: string[]; note: string };
    expect(body.keys).toHaveLength(3);
    expect(body.note).toBe("wechat");
    for (const key of body.keys) {
      expect(verifyLicenseKey(key, TEST_LICENSE_SECRET).valid).toBe(true);
    }
  });

  it("caps how many keys one request can mint", async () => {
    process.env.LICENSE_ADMIN_TOKEN = "admin-token";
    const res = createResponse();

    await issueHandler(
      {
        method: "POST",
        headers: { "x-admin-token": "admin-token" },
        body: { count: 5000 },
      },
      res,
    );

    expect((res.body as { keys: string[] }).keys).toHaveLength(50);
  });

  it("rejects a wrong admin token", async () => {
    process.env.LICENSE_ADMIN_TOKEN = "admin-token";
    const res = createResponse();

    await issueHandler(
      { method: "POST", headers: { "x-admin-token": "guess" }, body: {} },
      res,
    );

    expect(res.statusCode).toBe(401);
  });

  it("stays closed when no admin token is configured", async () => {
    const res = createResponse();

    await issueHandler({ method: "POST", headers: {}, body: {} }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: "服务端未配置 LICENSE_ADMIN_TOKEN，发卡接口已关闭。",
    });
  });
});

describe("paid endpoints behind the paywall", () => {
  it("refuses an unlicensed DeepSeek call before spending anything", async () => {
    process.env.DEEPSEEK_API_KEY = "should-never-be-used";
    const res = createResponse();

    await deepSeekHandler(
      {
        method: "POST",
        headers: {},
        body: { action: "translate_creator_reply", creatorReply: "Yes" },
      },
      res,
    );

    // Since accounts shipped, a caller with neither credential is told about
    // both ways in rather than only about keys.
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "未激活：请先登录，或输入卡密。" });
  });

  it("refuses a forged key on a paid endpoint", async () => {
    process.env.DEEPSEEK_API_KEY = "should-never-be-used";
    const res = createResponse();

    await deepSeekHandler(
      {
        method: "POST",
        headers: { "x-license-key": issueLicenseKey("not-the-real-secret") },
        body: { action: "translate_creator_reply", creatorReply: "Yes" },
      },
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "卡密无效，请检查后重新输入。" });
  });

  it("lets a licensed call through to the provider check", async () => {
    // No API key is set, so getting the provider's own error back is proof
    // the request cleared the paywall rather than being stopped by it.
    const res = createResponse();

    await deepSeekHandler(
      {
        method: "POST",
        headers: testLicenseHeaders(),
        body: { action: "translate_creator_reply", creatorReply: "Yes" },
      },
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("DEEPSEEK"),
    });
  });
});
