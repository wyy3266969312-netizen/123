import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NOT_APPROVED_ERROR,
  NOT_SIGNED_IN_ERROR,
  SESSION_EXPIRED_ERROR,
  checkPaidRequest,
  readBearerToken,
  verifyAccountAccess,
} from "../api/account-core";
import { issueLicenseKey } from "../api/license-core";
import {
  TEST_LICENSE_SECRET,
  clearTestLicenseSecret,
  testLicenseHeaders,
  useTestLicenseSecret,
} from "./licenseTestSupport";

const URL_BASE = "https://project.supabase.co";
const USER_ID = "11111111-2222-3333-4444-555555555555";

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: URL_BASE,
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
    LICENSE_SIGNING_SECRET: TEST_LICENSE_SECRET,
    ...extra,
  } as NodeJS.ProcessEnv;
}

/** Stub the two calls `verifyAccountAccess` makes, in order. */
function stubSupabase({
  user = { ok: true, id: USER_ID },
  profile = { ok: true, approved: true },
}: {
  user?: { ok: boolean; id?: string };
  profile?: { ok: boolean; approved?: boolean | null; rows?: unknown };
} = {}) {
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    void init;
    const url = String(input);

    if (url.includes("/auth/v1/user")) {
      return user.ok
        ? new Response(JSON.stringify({ id: user.id }), { status: 200 })
        : new Response("{}", { status: 401 });
    }

    if (url.includes("/rest/v1/profiles")) {
      if (!profile.ok) return new Response("{}", { status: 500 });
      const rows =
        profile.rows ??
        (profile.approved === null ? [] : [{ approved: profile.approved }]);
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    throw new Error(`unexpected fetch: ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => useTestLicenseSecret());
afterEach(() => {
  clearTestLicenseSecret();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readBearerToken", () => {
  it("pulls the token out of an Authorization header", () => {
    expect(readBearerToken({ authorization: "Bearer abc.def.ghi" })).toBe(
      "abc.def.ghi",
    );
    expect(readBearerToken({ Authorization: "bearer abc" })).toBe("abc");
  });

  it("returns empty for anything that is not a bearer token", () => {
    expect(readBearerToken({})).toBe("");
    expect(readBearerToken({ authorization: "Basic abc" })).toBe("");
    expect(readBearerToken(undefined)).toBe("");
  });
});

describe("verifyAccountAccess", () => {
  it("accepts an approved user", async () => {
    stubSupabase();

    expect(await verifyAccountAccess("token", env())).toEqual({
      ok: true,
      userId: USER_ID,
    });
  });

  it("checks approval with the secret key, never the caller's token", async () => {
    const fetchMock = stubSupabase();

    await verifyAccountAccess("caller-token", env());

    const profileCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/rest/v1/profiles"),
    );
    const headers = (profileCall?.[1] as RequestInit | undefined)
      ?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sb_secret_test");
    expect(headers.Authorization).not.toContain("caller-token");
  });

  it("refuses a signed-in user who has not been approved", async () => {
    stubSupabase({ profile: { ok: true, approved: false } });

    expect(await verifyAccountAccess("token", env())).toEqual({
      ok: false,
      status: 403,
      error: NOT_APPROVED_ERROR,
    });
  });

  it("treats a missing profile row as not approved", async () => {
    stubSupabase({ profile: { ok: true, approved: null } });

    expect(await verifyAccountAccess("token", env())).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("refuses an expired or forged token", async () => {
    stubSupabase({ user: { ok: false } });

    expect(await verifyAccountAccess("stale", env())).toEqual({
      ok: false,
      status: 401,
      error: SESSION_EXPIRED_ERROR,
    });
  });

  it("does not call the database when there is no token", async () => {
    const fetchMock = stubSupabase();

    expect(await verifyAccountAccess("", env())).toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a reachability problem as 502, not as a rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    expect(await verifyAccountAccess("token", env())).toMatchObject({
      status: 502,
    });
  });

  it("fails closed when Supabase is not configured", async () => {
    expect(
      await verifyAccountAccess("token", {
        SUPABASE_URL: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
      } as NodeJS.ProcessEnv),
    ).toMatchObject({ status: 500 });
  });
});

describe("checkPaidRequest: either credential opens the door", () => {
  it("lets a valid license key through without touching Supabase", async () => {
    const fetchMock = stubSupabase();

    expect(await checkPaidRequest(testLicenseHeaders(), env())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets an approved account through with no license key", async () => {
    stubSupabase();

    expect(
      await checkPaidRequest({ authorization: "Bearer token" }, env()),
    ).toBeNull();
  });

  it("rejects a bad key on its own terms, without suggesting sign-in", async () => {
    stubSupabase();

    const failure = await checkPaidRequest(
      { "x-license-key": issueLicenseKey("not-the-real-secret") },
      env(),
    );

    expect(failure).toEqual({
      status: 401,
      error: "卡密无效，请检查后重新输入。",
    });
  });

  it("names both ways in when nothing at all was presented", async () => {
    stubSupabase();

    expect(await checkPaidRequest({}, env())).toEqual({
      status: 401,
      error: NOT_SIGNED_IN_ERROR,
    });
  });

  it("tells a signed-in but unapproved user what to do next", async () => {
    stubSupabase({ profile: { ok: true, approved: false } });

    expect(
      await checkPaidRequest({ authorization: "Bearer token" }, env()),
    ).toEqual({ status: 403, error: NOT_APPROVED_ERROR });
  });

  it("still admits an approved account when the signing secret is missing", async () => {
    // A deployment that never sold keys has no signing secret. That must not
    // lock out account holders.
    stubSupabase();

    expect(
      await checkPaidRequest(
        { authorization: "Bearer token", "x-license-key": "SOP-ABCD" },
        env({ LICENSE_SIGNING_SECRET: "" }),
      ),
    ).toBeNull();
  });
});
