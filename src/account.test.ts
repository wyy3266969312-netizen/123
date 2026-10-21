import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

import {
  accountStateFor,
  completePasswordReset,
  describeAuthError,
  loadProfile,
  readRecoveryLink,
  registerAccount,
  requestPasswordReset,
  signIn,
  signOut,
  startRecoverySession,
  type AccountProfile,
} from "./account";

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { value: null as unknown },
}));

vi.mock("./supabaseClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supabaseClient")>()),
  getSupabase: () => supabaseMock.value,
  accountsConfigured: () => supabaseMock.value !== null,
}));

const USER_ID = "user-1";

function session(): Session {
  return {
    access_token: "token-abc",
    user: { id: USER_ID, email: "buyer@example.com" },
  } as Session;
}

function fakeClient({
  authError = null as string | null,
  row = {
    email: "buyer@example.com",
    approved: false,
    approved_at: null,
  } as Record<string, unknown> | null,
  rowError = null as string | null,
} = {}) {
  const signUp = vi.fn(async () => ({
    error: authError ? { message: authError } : null,
  }));
  const signInWithPassword = vi.fn(async () => ({
    error: authError ? { message: authError } : null,
  }));
  const signOutFn = vi.fn(async () => ({ error: null }));

  const maybeSingle = vi.fn(async () => ({
    data: row,
    error: rowError ? { message: rowError } : null,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  const resetPasswordForEmail = vi.fn(
    async (_email: string, _options?: { redirectTo?: string }) => ({
      error: authError ? { message: authError } : null,
    }),
  );
  const setSession = vi.fn(async () => ({
    error: authError ? { message: authError } : null,
  }));
  const exchangeCodeForSession = vi.fn(async () => ({
    error: authError ? { message: authError } : null,
  }));
  const verifyOtp = vi.fn(async () => ({
    error: authError ? { message: authError } : null,
  }));
  const updateUser = vi.fn(async () => ({
    error: authError ? { message: authError } : null,
  }));

  return {
    auth: {
      signUp,
      signInWithPassword,
      signOut: signOutFn,
      resetPasswordForEmail,
      setSession,
      exchangeCodeForSession,
      verifyOtp,
      updateUser,
    },
    from,
    _spies: {
      signUp,
      signInWithPassword,
      signOutFn,
      from,
      select,
      eq,
      resetPasswordForEmail,
      setSession,
      exchangeCodeForSession,
      verifyOtp,
      updateUser,
    },
  };
}

beforeEach(() => {
  supabaseMock.value = fakeClient();
});

afterEach(() => vi.clearAllMocks());

describe("describeAuthError", () => {
  it("turns Supabase's English into something a buyer can act on", () => {
    expect(describeAuthError("Invalid login credentials")).toBe(
      "邮箱或密码不对，请检查后重试。",
    );
    expect(describeAuthError("Email not confirmed")).toBe(
      "邮箱还没验证，请先点开注册邮件里的链接。",
    );
    expect(describeAuthError("User already registered")).toBe(
      "这个邮箱已经注册过了，直接登录即可。",
    );
    expect(describeAuthError("Password should be at least 6 characters")).toBe(
      "密码太短了，至少需要 6 位。",
    );
  });

  it("passes through anything it does not recognise, rather than hiding it", () => {
    // Flattening an unknown failure into "something went wrong" would leave
    // both the buyer and the seller with nothing to go on.
    expect(describeAuthError("Signups not allowed for this instance")).toBe(
      "Signups not allowed for this instance",
    );
  });

  it("falls back to a generic message only when there is no text at all", () => {
    expect(describeAuthError("   ")).toBe("操作失败，请稍后重试。");
  });
});

describe("registerAccount / signIn", () => {
  it("reports success and forwards a trimmed email", async () => {
    const client = fakeClient();
    supabaseMock.value = client;

    expect(await registerAccount("  buyer@example.com ", "pw")).toEqual({
      ok: true,
    });
    expect(client._spies.signUp).toHaveBeenCalledWith({
      email: "buyer@example.com",
      password: "pw",
    });
  });

  it("translates a failure instead of surfacing raw English", async () => {
    supabaseMock.value = fakeClient({ authError: "Invalid login credentials" });

    expect(await signIn("buyer@example.com", "wrong")).toEqual({
      ok: false,
      error: "邮箱或密码不对，请检查后重试。",
    });
  });

  it("says so plainly when the deployment has no accounts", async () => {
    supabaseMock.value = null;

    expect(await registerAccount("a@b.com", "pw")).toEqual({
      ok: false,
      error: "本部署未启用账号功能。",
    });
    await expect(signOut()).resolves.toBeUndefined();
  });
});

describe("loadProfile", () => {
  it("reads the caller's own row", async () => {
    const client = fakeClient({
      row: {
        email: "buyer@example.com",
        approved: true,
        approved_at: "2026-09-08T00:00:00Z",
      },
    });
    supabaseMock.value = client;

    expect(await loadProfile(session())).toEqual({
      id: USER_ID,
      email: "buyer@example.com",
      approved: true,
      approvedAt: "2026-09-08T00:00:00Z",
    });
    expect(client._spies.eq).toHaveBeenCalledWith("id", USER_ID);
  });

  it("treats a missing row as not approved, not as an error", async () => {
    // The row is created by a database trigger. Someone without one has
    // certainly not been approved, so the safe reading is "no".
    supabaseMock.value = fakeClient({ row: null });

    expect(await loadProfile(session())).toMatchObject({
      approved: false,
      email: "buyer@example.com",
    });
  });

  it("returns null when the row cannot be read", async () => {
    supabaseMock.value = fakeClient({ rowError: "permission denied" });

    expect(await loadProfile(session())).toBeNull();
  });

  it("never reports approved for a row that says otherwise", async () => {
    for (const approved of [false, null, undefined, 0, ""]) {
      supabaseMock.value = fakeClient({
        row: { email: "b@c.com", approved, approved_at: null },
      });

      expect((await loadProfile(session()))?.approved).toBe(false);
    }
  });
});

describe("accountStateFor", () => {
  const profile = (approved: boolean): AccountProfile => ({
    id: USER_ID,
    email: "buyer@example.com",
    approved,
    approvedAt: "",
  });

  it("maps approval onto the three gate states", () => {
    expect(accountStateFor(null)).toEqual({ status: "signed-out" });
    expect(accountStateFor(profile(false))).toEqual({
      status: "pending",
      profile: profile(false),
    });
    expect(accountStateFor(profile(true))).toEqual({
      status: "approved",
      profile: profile(true),
    });
  });
});

describe("reading a password-reset link", () => {
  it("does not put a JWT complaint in front of a buyer", () => {
    // What Supabase actually returns for a tampered or already-spent link.
    expect(describeAuthError("Invalid JWT structure")).toBe(
      "这个链接无效或者已经用过了，请重新发一封重置邮件。",
    );
  });

  it("recognises the implicit flow's hash without needing our own marker", () => {
    expect(
      readRecoveryLink(
        "",
        "#access_token=abc&refresh_token=def&type=recovery&expires_in=3600",
      ),
    ).toEqual({ kind: "tokens", accessToken: "abc", refreshToken: "def" });
  });

  it("only trusts PKCE's code when it comes back to the address we asked for", () => {
    // A bare ?code= could be anything; without the marker it is not a reset.
    expect(readRecoveryLink("?code=xyz", "")).toBeNull();
    expect(readRecoveryLink("?recovery=1&code=xyz", "")).toEqual({
      kind: "code",
      code: "xyz",
    });
  });

  it("recognises the token_hash template", () => {
    expect(
      readRecoveryLink("?recovery=1&token_hash=hash-1&type=recovery", ""),
    ).toEqual({ kind: "otp", tokenHash: "hash-1" });
  });

  it("says plainly when the link has expired, which is the usual case", () => {
    const link = readRecoveryLink(
      "",
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(link).toEqual({
      kind: "error",
      error: "这个重置链接已经过期了（链接一小时内有效）。请重新发一封。",
    });
  });

  it("is null for an ordinary visit", () => {
    expect(readRecoveryLink("", "")).toBeNull();
    expect(readRecoveryLink("?demo=1", "")).toBeNull();
  });
});

describe("password reset", () => {
  it("asks Supabase to send people back to the marked address", async () => {
    const client = fakeClient();
    supabaseMock.value = client;

    expect(await requestPasswordReset("  buyer@example.com ")).toEqual({
      ok: true,
    });
    const [email, options] = client._spies.resetPasswordForEmail.mock.calls[0];
    expect(email).toBe("buyer@example.com");
    expect(options?.redirectTo).toContain("recovery=1");
  });

  it("starts the recovery session with whichever proof the link carried", async () => {
    const client = fakeClient();
    supabaseMock.value = client;

    await startRecoverySession({
      kind: "tokens",
      accessToken: "a",
      refreshToken: "b",
    });
    expect(client._spies.setSession).toHaveBeenCalledWith({
      access_token: "a",
      refresh_token: "b",
    });

    await startRecoverySession({ kind: "code", code: "c" });
    expect(client._spies.exchangeCodeForSession).toHaveBeenCalledWith("c");

    await startRecoverySession({ kind: "otp", tokenHash: "h" });
    expect(client._spies.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "h",
    });
  });

  it("refuses a link that already arrived broken", async () => {
    expect(
      await startRecoverySession({ kind: "error", error: "链接过期了。" }),
    ).toEqual({ ok: false, error: "链接过期了。" });
  });

  it("signs out after setting the password, so the new one has to be used", async () => {
    const client = fakeClient();
    supabaseMock.value = client;

    expect(await completePasswordReset("new-password")).toEqual({ ok: true });
    expect(client._spies.updateUser).toHaveBeenCalledWith({
      password: "new-password",
    });
    expect(client._spies.signOutFn).toHaveBeenCalled();
  });

  it("keeps the recovery session alive when the password was rejected", async () => {
    const client = fakeClient({
      authError: "Password should be at least 6 characters",
    });
    supabaseMock.value = client;

    expect(await completePasswordReset("123")).toEqual({
      ok: false,
      error: "密码太短了，至少需要 6 位。",
    });
    expect(client._spies.signOutFn).not.toHaveBeenCalled();
  });
});
