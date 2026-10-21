import { useState } from "react";

import {
  completePasswordReset,
  describeAuthError,
  registerAccount,
  requestPasswordReset,
  signIn,
  signOut,
  type AccountProfile,
} from "../../account";
import { licenseSalesInfo } from "../../licenseSalesInfo";

/**
 * The two account screens: signing in or registering, and the wait between
 * registering and being approved.
 *
 * Registering deliberately does not grant access. `profiles.approved` starts
 * false and only the seller can flip it, so a new account lands on the waiting
 * screen until payment is confirmed on WeChat. Saying that plainly here is the
 * difference between a buyer who waits and one who thinks the site is broken.
 */

type Mode = "sign-in" | "register" | "forgot";

export function AccountPanel({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    const result =
      mode === "register"
        ? await registerAccount(email, password)
        : mode === "forgot"
          ? await requestPasswordReset(email)
          : await signIn(email, password);

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (mode === "forgot") {
      // Deliberately the same message whether or not the address is
      // registered: the reset form must not become a way to find out who has
      // an account here.
      setNotice(
        `如果 ${email.trim()} 注册过，重置链接已经发过去了。请查收邮件（也看一下垃圾邮件），链接一小时内有效。`,
      );
      setMode("sign-in");
      return;
    }

    if (mode === "register") {
      setNotice(
        "账号已创建。如果收到验证邮件，请先点开里面的链接，然后回来登录。",
      );
      setMode("sign-in");
      setPassword("");
      return;
    }

    onSignedIn();
  }

  return (
    <div className="access-account">
      <div className="access-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-in"}
          className={mode === "sign-in" ? "active" : "secondary"}
          onClick={() => {
            setMode("sign-in");
            setError("");
          }}
        >
          登录
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={mode === "register" ? "active" : "secondary"}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          注册
        </button>
      </div>

      {mode === "forgot" && (
        <p className="muted">
          填注册用的邮箱，我们发一封重置链接过去。密码重置不影响开通状态。
        </p>
      )}

      <form onSubmit={submit}>
        <label>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        {mode !== "forgot" && (
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
            />
          </label>
        )}
        {mode === "register" && (
          <p className="muted">至少 6 位。注册后需要我开通才能使用。</p>
        )}
        <button type="submit" disabled={busy}>
          {busy
            ? "处理中…"
            : mode === "register"
              ? "注册"
              : mode === "forgot"
                ? "发送重置链接"
                : "登录"}
        </button>
      </form>

      {mode === "sign-in" && (
        <button
          type="button"
          className="link-button access-forgot"
          onClick={() => {
            setMode("forgot");
            setError("");
            setNotice("");
          }}
        >
          忘记密码？
        </button>
      )}
      {mode === "forgot" && (
        <button
          type="button"
          className="link-button access-forgot"
          onClick={() => {
            setMode("sign-in");
            setError("");
          }}
        >
          返回登录
        </button>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="access-notice">{notice}</p>}
    </div>
  );
}

/**
 * Where a reset link lands: set a new password, then sign in with it.
 *
 * Nothing else is reachable from here. The session behind this screen was
 * created by clicking a link in an email, which proves the person can read
 * that inbox and nothing more — so the only thing it can do is change the
 * password, and it ends the moment that happens.
 */
export function ResetPasswordPage({
  onDone,
  onCancel,
  linkError,
}: {
  onDone: (notice: string) => void;
  onCancel: () => void;
  /** Set when the link itself was bad, e.g. expired. No form in that case. */
  linkError: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (password !== confirmation) {
      setError("两次输入的密码不一样，请检查一下。");
      return;
    }
    if (password.length < 6) {
      setError("密码太短了，至少需要 6 位。");
      return;
    }

    setBusy(true);
    setError("");
    const result = await completePasswordReset(password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onDone("密码已经改好了，请用新密码登录。");
  }

  return (
    <div className="paywall">
      <section className="paywall-card paywall-card-narrow">
        <p className="eyebrow">Hazel 达人营销</p>
        <h1>设置新密码</h1>

        {linkError ? (
          <>
            <p className="error" role="alert">
              {linkError}
            </p>
            <button type="button" onClick={onCancel}>
              返回登录，重新发一封
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              设置好之后需要用新密码登录一次。开通状态不受影响，之前已经开通的账号还是开通的。
            </p>
            <form onSubmit={submit} className="access-account">
              <label>
                新密码
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                再输一次
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <p className="muted">至少 6 位。</p>
              <button type="submit" disabled={busy}>
                {busy ? "保存中…" : "保存新密码"}
              </button>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="link-button access-forgot"
              onClick={onCancel}
            >
              取消，返回登录
            </button>
          </>
        )}
      </section>
    </div>
  );
}

export function PendingApprovalPage({
  profile,
  onRecheck,
  onSignedOut,
}: {
  profile: AccountProfile;
  onRecheck: () => void;
  onSignedOut: () => void;
}) {
  const sales = licenseSalesInfo();
  const [checking, setChecking] = useState(false);

  async function recheck() {
    setChecking(true);
    await Promise.resolve(onRecheck());
    setChecking(false);
  }

  return (
    <div className="paywall">
      <section className="paywall-card">
        <p className="eyebrow">Hazel 达人营销</p>
        <h1>账号已创建，等待开通</h1>
        <p className="muted">
          你的账号 <strong>{profile.email}</strong> 已经注册好了，
          还差最后一步：付款后由我手动开通。
        </p>

        <div className="access-pending-steps">
          <p>
            微信搜索{" "}
            <strong className="paywall-contact">{sales.contact}</strong>{" "}
            加我，备注「SOP 工具」，并告诉我你注册用的邮箱。
          </p>
          <p className="muted">
            我会把收款方式发给你，转账 {sales.priceLabel} 后我立刻给你开通。
            开通是一次性的，之后这个账号永久可用。
          </p>
        </div>

        <div className="inline-actions">
          <button type="button" onClick={recheck} disabled={checking}>
            {checking ? "检查中…" : "我已付款，刷新看看"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void signOut().then(onSignedOut)}
          >
            退出登录
          </button>
        </div>

        <p className="paywall-footnote muted">
          等待期间可以
          <a href="?demo=1">用演示数据先看一遍</a>
          ，那是一套假达人数据，完全免费。
        </p>
      </section>
    </div>
  );
}

export { describeAuthError };
