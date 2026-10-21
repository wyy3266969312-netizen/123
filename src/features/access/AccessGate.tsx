import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  accountStateFor,
  accountsConfigured,
  clearRecoveryLinkFromUrl,
  currentSession,
  loadProfile,
  recoveryLinkFromLocation,
  startRecoverySession,
  type AccountProfile,
} from "../../account";
import { isDemoMode } from "../../demoMode";
import {
  activateLicense,
  isLicenseGateActive,
  loadActivation,
  needsRevalidation,
  revalidateActivation,
  type LicenseActivation,
} from "../../license";
import { formatLicenseKey, normalizeLicenseKey } from "../../licenseKeyFormat";
import {
  LICENSE_INCLUDED_FEATURES,
  licenseSalesInfo,
} from "../../licenseSalesInfo";
import {
  AccountPanel,
  PendingApprovalPage,
  ResetPasswordPage,
} from "./accountViews";

/**
 * The paywall. Everything behind it is the paid app; in front of it is the
 * purchase page.
 *
 * There are two ways through, and they are equal: a license key, or an account
 * the seller has approved. Keys came first and every one already sold keeps
 * working — accounts were added beside them, not on top of them, so shipping
 * this stranded nobody.
 *
 * Two paths deliberately walk straight through:
 *
 * - Safe Demo Mode (`?demo=1`) is the free preview a buyer looks at before
 *   paying, and it only ever shows fake data.
 * - Development builds, because `vite dev` never serves `/api` and a key
 *   could not be verified there. See `isLicenseGateActive`.
 */

type GateStatus = "checking" | "locked" | "pending" | "unlocked" | "recovering";

const DEMO_URL = "?demo=1";

export function AccessGate({ children }: { children: ReactNode }) {
  const [demoMode] = useState(isDemoMode);
  /**
   * Read once, before anything else looks at the URL.
   *
   * A reset link has to outrank every other way in — including a saved license
   * key and a still-valid session, both of which would otherwise open the app
   * and leave the person who came to change their password staring at a
   * dashboard with no way to do it.
   */
  const [recoveryLink] = useState(() =>
    demoMode ? null : recoveryLinkFromLocation(),
  );
  const [status, setStatus] = useState<GateStatus>(() => {
    if (recoveryLink) return "recovering";
    return demoMode || !isLicenseGateActive() ? "unlocked" : "checking";
  });
  const [recoveryError, setRecoveryError] = useState(
    recoveryLink?.kind === "error" ? recoveryLink.error : "",
  );
  const [activation, setActivation] = useState<LicenseActivation | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [notice, setNotice] = useState("");
  /**
   * Kept apart from `notice`, which belongs to the license-key form and is
   * rendered inside a <details> that is collapsed whenever accounts are on.
   * "密码已经改好了" has to be the first thing on the page, not the first thing
   * behind a disclosure triangle.
   */
  const [accountNotice, setAccountNotice] = useState("");

  // Turn the link into the one session that may set a password, and take the
  // tokens out of the address bar either way — they are credentials, and they
  // should not survive in history or a shared screenshot.
  useEffect(() => {
    if (!recoveryLink) return;

    let cancelled = false;
    void (async () => {
      if (recoveryLink.kind !== "error") {
        const outcome = await startRecoverySession(recoveryLink);
        if (!cancelled && !outcome.ok) setRecoveryError(outcome.error);
      }
      clearRecoveryLinkFromUrl();
    })();

    return () => {
      cancelled = true;
    };
  }, [recoveryLink]);

  // A license key is checked first because it answers from `localStorage`
  // without a round trip. Only when there is none is the account path worth
  // the network call.
  useEffect(() => {
    if (status !== "checking") return;

    const saved = loadActivation();
    if (saved) {
      setActivation(saved);
      setStatus("unlocked");
      return;
    }

    if (!accountsConfigured()) {
      setStatus("locked");
      return;
    }

    let cancelled = false;
    void (async () => {
      const session = await currentSession();
      const loaded = session ? await loadProfile(session) : null;
      if (cancelled) return;

      const state = accountStateFor(loaded);
      setProfile(state.status === "signed-out" ? null : state.profile);
      setStatus(
        state.status === "approved"
          ? "unlocked"
          : state.status === "pending"
            ? "pending"
            : "locked",
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  // Re-check a stored key from time to time, so a refunded or leaked key can
  // be taken back. A server that cannot be reached leaves access untouched.
  useEffect(() => {
    if (status !== "unlocked" || !activation) return;
    if (!needsRevalidation(activation)) return;

    let cancelled = false;
    void revalidateActivation(activation).then((outcome) => {
      if (cancelled) return;

      if (outcome.status === "rejected") {
        setActivation(null);
        setNotice(outcome.error);
        setStatus("locked");
        return;
      }

      if (outcome.status === "renewed") setActivation(outcome.activation);
    });

    return () => {
      cancelled = true;
    };
  }, [status, activation]);

  const handleActivated = useCallback((next: LicenseActivation) => {
    setActivation(next);
    setNotice("");
    setStatus("unlocked");
  }, []);

  const recheck = useCallback(() => {
    setProfile(null);
    setStatus("checking");
  }, []);

  if (status === "recovering") {
    return (
      <ResetPasswordPage
        linkError={recoveryError}
        onDone={(message) => {
          setAccountNotice(message);
          setStatus("checking");
        }}
        onCancel={() => {
          setRecoveryError("");
          setStatus("checking");
        }}
      />
    );
  }

  if (status === "checking") return null;
  if (status === "unlocked") return <>{children}</>;

  if (status === "pending" && profile) {
    return (
      <PendingApprovalPage
        profile={profile}
        onRecheck={recheck}
        onSignedOut={recheck}
      />
    );
  }

  return (
    <PurchasePage
      notice={notice}
      accountNotice={accountNotice}
      onActivated={handleActivated}
      onSignedIn={recheck}
    />
  );
}

function PurchasePage({
  notice,
  accountNotice,
  onActivated,
  onSignedIn,
}: {
  notice: string;
  accountNotice: string;
  onActivated: (activation: LicenseActivation) => void;
  onSignedIn: () => void;
}) {
  const sales = licenseSalesInfo();
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalized = normalizeLicenseKey(keyInput);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");
    const result = await activateLicense(keyInput);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onActivated(result.activation);
  }

  return (
    <div className="paywall">
      <section className="paywall-card">
        <p className="eyebrow">Hazel 达人营销</p>
        <h1>{sales.priceLabel} 一次付清，永久使用</h1>
        <p className="muted">
          没有月费，没有续费。注册账号，付款后我给你开通，之后永久可用。
        </p>

        {accountNotice && (
          <p className="access-notice" role="status">
            {accountNotice}
          </p>
        )}

        <ul className="paywall-features">
          {LICENSE_INCLUDED_FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>

        <div className="paywall-columns">
          <div className="paywall-buy">
            <h2>1. 加微信付款</h2>
            {sales.payQrUrl && (
              <img
                className="paywall-qr"
                src={sales.payQrUrl}
                alt="付款二维码"
              />
            )}
            {sales.buyUrl && (
              <p>
                <a
                  className="paywall-buy-link"
                  href={sales.buyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  去付款页面
                </a>
              </p>
            )}
            {sales.contact ? (
              <>
                <p>
                  微信搜索{" "}
                  <strong className="paywall-contact">{sales.contact}</strong>{" "}
                  加我，备注「SOP 工具」。
                </p>
                <p className="muted">
                  我会把收款方式发给你，转账 {sales.priceLabel}{" "}
                  后给你开通。买之前想问什么，也可以先在微信里聊。
                </p>
              </>
            ) : (
              <p className="muted">
                付款方式还没有配置。请联系本工具的提供者获取卡密。
              </p>
            )}
          </div>

          <div className="paywall-activate">
            <h2>2. 注册账号</h2>
            {accountsConfigured() ? (
              <AccountPanel onSignedIn={onSignedIn} />
            ) : (
              <p className="muted">本部署未启用账号功能，请使用卡密。</p>
            )}

            <details className="access-legacy-key" open={!accountsConfigured()}>
              <summary>已经买过卡密？点这里输入</summary>
              <form onSubmit={submit}>
                <label>
                  卡密
                  <input
                    value={keyInput}
                    onChange={(event) => setKeyInput(event.target.value)}
                    placeholder="SOP-XXXX-XXXX-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="paywall-key-hint"
                  />
                </label>
                <p id="paywall-key-hint" className="muted">
                  大小写和中间的横线都不影响，整段粘贴进来就行。
                  {normalized.length > 0 && (
                    <>
                      {" "}
                      已识别：<code>{formatLicenseKey(normalized)}</code>
                    </>
                  )}
                </p>
                <button type="submit" disabled={submitting}>
                  {submitting ? "校验中…" : "激活"}
                </button>
              </form>
              {(error || notice) && (
                <p className="error" role="alert">
                  {error || notice}
                </p>
              )}
            </details>
          </div>
        </div>

        <p className="paywall-footnote">
          还没决定？
          <a href={DEMO_URL}>先用演示数据看一遍</a>
          —— 演示模式完全免费，用的是一套假达人数据，不会读写你的真实数据。
        </p>
        <p className="paywall-footnote muted">
          账号在哪台电脑都能登录。但请注意：
          <strong>你的达人数据存在各自的浏览器里，不会跟着账号同步</strong>
          —— 换电脑请用工具里的导出 /
          导入功能带过去。我们的服务器不保存你的达人数据。
        </p>
      </section>
    </div>
  );
}
