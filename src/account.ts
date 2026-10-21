/**
 * Accounts: register, sign in, and find out whether this person has been
 * approved to use the tool.
 *
 * Approval is manual and deliberate. `profiles.approved` starts false for
 * everyone and only the seller can set it — the row-level policy grants a
 * signed-in user read access to their own row and no write access at all, so
 * registering gets you a waiting screen, never access. That is the whole point
 * of the model: payment happens on WeChat, and the seller flips the flag once
 * the money arrives.
 *
 * Accounts sit alongside license keys rather than replacing them. Every key
 * already sold keeps working; see `src/license.ts`.
 */
import type { Session } from "@supabase/supabase-js";

import { getSupabase, accountsConfigured } from "./supabaseClient";

export type AccountProfile = {
  id: string;
  email: string;
  approved: boolean;
  /** ISO timestamp, or "" when still waiting. */
  approvedAt: string;
};

export type AccountState =
  /** No Supabase configured, or nobody signed in. */
  | { status: "signed-out" }
  /** Signed in, approval pending — the waiting screen. */
  | { status: "pending"; profile: AccountProfile }
  /** Signed in and approved — the app opens. */
  | { status: "approved"; profile: AccountProfile };

export type AuthOutcome = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "操作失败，请稍后重试。";

/**
 * Supabase reports auth failures in English and, for some cases, in terms a
 * buyer cannot act on. These are the ones worth translating; anything else
 * falls through to the original text rather than being flattened into a
 * useless generic message.
 */
const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "邮箱或密码不对，请检查后重试。"],
  [/email not confirmed/i, "邮箱还没验证，请先点开注册邮件里的链接。"],
  [
    /user already registered|already been registered/i,
    "这个邮箱已经注册过了，直接登录即可。",
  ],
  [/password should be at least/i, "密码太短了，至少需要 6 位。"],
  [/unable to validate email|invalid email/i, "邮箱格式不对，请检查一下。"],
  [/rate limit|too many requests/i, "尝试次数过多，请等几分钟再试。"],
  // A tampered, truncated or already-spent recovery link comes back as a JWT
  // complaint. "Invalid JWT structure" in front of a buyer is not a message,
  // it is a stack trace.
  [
    /invalid jwt|jwt structure|invalid token|token has invalid|bad_jwt/i,
    "这个链接无效或者已经用过了，请重新发一封重置邮件。",
  ],
  [/network|fetch/i, "连不上服务器，请检查网络后重试。"],
];

export function describeAuthError(raw: string): string {
  for (const [pattern, message] of ERROR_MESSAGES) {
    if (pattern.test(raw)) return message;
  }

  return raw.trim() || GENERIC_ERROR;
}

export async function registerAccount(
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "本部署未启用账号功能。" };

  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });

  return error
    ? { ok: false, error: describeAuthError(error.message) }
    : { ok: true };
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "本部署未启用账号功能。" };

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  return error
    ? { ok: false, error: describeAuthError(error.message) }
    : { ok: true };
}

/* -------------------------------------------------------------------------
   Forgotten passwords.

   Supabase mails a link; the link comes back to this same page carrying proof
   that the person can read that inbox. What form that proof takes depends on
   the project's flow and its email template, so all four are handled: the
   implicit hash, PKCE's `code`, the newer `token_hash`, and — the one that
   actually happens most — an expired link that carries only an error.

   `detectSessionInUrl` stays off. Letting the client silently swallow the hash
   would sign a recovery visitor straight into the app, which is precisely what
   must not happen: they have proved they can read the email, not that they
   know the password. The URL is read here instead, and the only thing it
   unlocks is the form that sets a new one.
   ---------------------------------------------------------------------- */

/** The marker we ask Supabase to send back, so a stray `?code=` is not mistaken for a reset. */
export const RECOVERY_QUERY_FLAG = "recovery";

export type RecoveryLink =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "code"; code: string }
  | { kind: "otp"; tokenHash: string }
  | { kind: "error"; error: string };

/** Where the reset email should send people back to. */
export function passwordResetRedirectTo(): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${RECOVERY_QUERY_FLAG}=1`;
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

/**
 * What, if anything, this URL says about a password reset.
 *
 * Pure so it can be tested against every shape a Supabase project might send
 * without a browser: the live round trip through an inbox is the one part of
 * this flow a test cannot reach.
 */
export function readRecoveryLink(
  search: string,
  hash: string,
): RecoveryLink | null {
  const query = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const fragment = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );

  // An expired or already-used link arrives with nothing but an error, and it
  // is the most common outcome of all — links are good for one hour.
  const error = fragment.get("error") ?? query.get("error");
  if (error) {
    const code = fragment.get("error_code") ?? query.get("error_code") ?? "";
    const description =
      fragment.get("error_description") ?? query.get("error_description") ?? "";
    return {
      kind: "error",
      error: /expired|otp_expired/i.test(`${code} ${description}`)
        ? "这个重置链接已经过期了（链接一小时内有效）。请重新发一封。"
        : describeAuthError(decodeParam(description)) ||
          "重置链接无效，请重新发一封。",
    };
  }

  // The implicit flow says what it is, so it needs no marker of ours.
  if (fragment.get("type") === "recovery" && fragment.get("access_token")) {
    return {
      kind: "tokens",
      accessToken: fragment.get("access_token") ?? "",
      refreshToken: fragment.get("refresh_token") ?? "",
    };
  }

  // PKCE and the token_hash template do not, so they are only trusted when
  // they come back to the address we asked Supabase to use.
  if (query.get(RECOVERY_QUERY_FLAG) !== "1") return null;

  const code = query.get("code");
  if (code) return { kind: "code", code };

  const tokenHash = query.get("token_hash");
  if (tokenHash && query.get("type") === "recovery")
    return { kind: "otp", tokenHash };

  return null;
}

/** Reads the current page's URL. Separate from the parser so tests need no browser. */
export function recoveryLinkFromLocation(): RecoveryLink | null {
  if (typeof window === "undefined") return null;
  return readRecoveryLink(window.location.search, window.location.hash);
}

/**
 * Takes the tokens out of the address bar once they have been used. They are
 * credentials, and leaving them in the URL puts them in history, in a shared
 * screenshot, and in whatever the next page's Referer header reaches.
 */
export function clearRecoveryLinkFromUrl(): void {
  if (typeof window === "undefined") return;
  const { origin, pathname } = window.location;
  window.history.replaceState({}, "", `${origin}${pathname}`);
}

/** Sends the reset email. Never says whether the address is registered. */
export async function requestPasswordReset(
  email: string,
): Promise<AuthOutcome> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "本部署未启用账号功能。" };

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: passwordResetRedirectTo(),
  });

  return error
    ? { ok: false, error: describeAuthError(error.message) }
    : { ok: true };
}

/** Turns a link into a session that may do exactly one thing: set a password. */
export async function startRecoverySession(
  link: RecoveryLink,
): Promise<AuthOutcome> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "本部署未启用账号功能。" };
  if (link.kind === "error") return { ok: false, error: link.error };

  if (link.kind === "tokens") {
    const { error } = await supabase.auth.setSession({
      access_token: link.accessToken,
      refresh_token: link.refreshToken,
    });
    return error
      ? { ok: false, error: describeAuthError(error.message) }
      : { ok: true };
  }

  if (link.kind === "code") {
    const { error } = await supabase.auth.exchangeCodeForSession(link.code);
    return error
      ? { ok: false, error: describeAuthError(error.message) }
      : { ok: true };
  }

  const { error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: link.tokenHash,
  });
  return error
    ? { ok: false, error: describeAuthError(error.message) }
    : { ok: true };
}

/**
 * Sets the new password, then signs out.
 *
 * Signing out is the point of the extra step: the recovery session came from
 * an emailed link, and ending it means the new password has to be typed once
 * before anything opens — which also proves it was saved.
 */
export async function completePasswordReset(
  password: string,
): Promise<AuthOutcome> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "本部署未启用账号功能。" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: describeAuthError(error.message) };

  await supabase.auth.signOut();
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

/**
 * Read the signed-in user's own profile row.
 *
 * A missing row is treated as "not approved" rather than an error: the row is
 * created by a database trigger on sign-up, and a person who somehow has none
 * has certainly not been approved.
 */
export async function loadProfile(
  session: Session,
): Promise<AccountProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, approved, approved_at")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) return null;

  return {
    id: session.user.id,
    email: data?.email ?? session.user.email ?? "",
    approved: Boolean(data?.approved),
    approvedAt: (data?.approved_at as string | null) ?? "",
  };
}

export function accountStateFor(profile: AccountProfile | null): AccountState {
  if (!profile) return { status: "signed-out" };
  return profile.approved
    ? { status: "approved", profile }
    : { status: "pending", profile };
}

/** Current session, or `null` when signed out or accounts are not configured. */
export async function currentSession(): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/** The access token paid API calls present, or "" when signed out. */
export async function accountAccessToken(): Promise<string> {
  return (await currentSession())?.access_token ?? "";
}

export { accountsConfigured };
