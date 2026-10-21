import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccessGate } from "./AccessGate";
import {
  LICENSE_REVALIDATE_AFTER_DAYS,
  loadActivation,
  saveActivation,
  type LicenseActivation,
} from "../../license";
import { issueLicenseKey } from "../../../api/license-core";
import { TEST_LICENSE_SECRET } from "../../licenseTestSupport";

const {
  gateActive,
  demoMode,
  accountsOn,
  session,
  profile,
  startRecovery,
  completeReset,
} = vi.hoisted(() => ({
  gateActive: vi.fn(() => true),
  demoMode: vi.fn(() => false),
  accountsOn: vi.fn(() => false),
  session: vi.fn(async () => null as unknown),
  profile: vi.fn(async () => null as unknown),
  startRecovery: vi.fn(async () => ({ ok: true })),
  completeReset: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../license", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../license")>()),
  isLicenseGateActive: gateActive,
}));

vi.mock("../../demoMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../demoMode")>()),
  isDemoMode: demoMode,
}));

vi.mock("../../account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../account")>()),
  accountsConfigured: accountsOn,
  currentSession: session,
  loadProfile: profile,
  // The link parser is the real one — the point of these tests is that a real
  // URL reaches the reset screen. Only the network calls are stubbed.
  startRecoverySession: startRecovery,
  completePasswordReset: completeReset,
}));

const VALID_KEY = issueLicenseKey(TEST_LICENSE_SECRET);

function storedActivation(
  patch: Partial<LicenseActivation> = {},
): LicenseActivation {
  return {
    key: VALID_KEY,
    serial: "ABCDEFGH",
    activatedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    ...patch,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function renderGate() {
  return render(
    <AccessGate>
      <p>付费内容</p>
    </AccessGate>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  gateActive.mockReturnValue(true);
  demoMode.mockReturnValue(false);
  accountsOn.mockReturnValue(false);
  session.mockResolvedValue(null);
  profile.mockResolvedValue(null);
  startRecovery.mockResolvedValue({ ok: true });
  completeReset.mockResolvedValue({ ok: true });
  window.history.replaceState({}, "", "/");
});

/** A signed-in Supabase session, as far as the gate cares. */
function signedIn(approved: boolean) {
  accountsOn.mockReturnValue(true);
  session.mockResolvedValue({ user: { id: "u1" } });
  profile.mockResolvedValue({
    id: "u1",
    email: "buyer@example.com",
    approved,
    approvedAt: approved ? "2026-09-08T00:00:00Z" : "",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AccessGate", () => {
  it("shows the purchase page instead of the app when no key is stored", async () => {
    renderGate();

    expect(
      await screen.findByRole("heading", { name: /一次付清，永久使用/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("付费内容")).not.toBeInTheDocument();
  });

  it("shows the app when a stored key is still inside its trust window", async () => {
    saveActivation(storedActivation());

    renderGate();

    expect(await screen.findByText("付费内容")).toBeInTheDocument();
  });

  it("tells a locked-out visitor exactly how to buy", async () => {
    // The purchase copy is the whole sales flow: add the WeChat ID, pay there,
    // get a key back. A page that renders without it is a dead storefront.
    renderGate();

    expect(await screen.findByText("el_hazel")).toBeInTheDocument();
    expect(screen.getByText(/微信搜索/)).toBeInTheDocument();
    expect(screen.getByText(/备注/)).toBeInTheDocument();
    expect(screen.getByText(/转账 ¥49/)).toBeInTheDocument();
    expect(screen.queryByText(/付款方式还没有配置/)).not.toBeInTheDocument();
  });

  it("lets the demo through without a key, so buyers can look first", async () => {
    demoMode.mockReturnValue(true);

    renderGate();

    expect(await screen.findByText("付费内容")).toBeInTheDocument();
  });

  it("does not gate development builds, where /api is not served", async () => {
    gateActive.mockReturnValue(false);

    renderGate();

    expect(await screen.findByText("付费内容")).toBeInTheDocument();
  });

  it("unlocks after a key is accepted, and remembers it", async () => {
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
    const user = userEvent.setup();
    renderGate();

    await user.type(await screen.findByLabelText("卡密"), VALID_KEY);
    await user.click(screen.getByRole("button", { name: "激活" }));

    expect(await screen.findByText("付费内容")).toBeInTheDocument();
    expect(loadActivation()?.key).toBe(VALID_KEY);
  });

  it("keeps the buyer on the purchase page when the key is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, { error: "卡密无效，请检查后重新输入。" }),
      ),
    );
    const user = userEvent.setup();
    renderGate();

    await user.type(await screen.findByLabelText("卡密"), VALID_KEY);
    await user.click(screen.getByRole("button", { name: "激活" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "卡密无效，请检查后重新输入。",
    );
    expect(screen.queryByText("付费内容")).not.toBeInTheDocument();
  });

  it("echoes the normalized key back so a bad paste is visible", async () => {
    const user = userEvent.setup();
    renderGate();

    await user.type(
      await screen.findByLabelText("卡密"),
      VALID_KEY.toLowerCase().replace(/-/g, ""),
    );

    expect(await screen.findByText(VALID_KEY)).toBeInTheDocument();
  });

  it("re-checks a stale key and locks up if the server rejects it", async () => {
    const staleVerifiedAt = new Date(
      Date.now() - (LICENSE_REVALIDATE_AFTER_DAYS + 1) * 86_400_000,
    ).toISOString();
    saveActivation(storedActivation({ verifiedAt: staleVerifiedAt }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(403, { error: "该卡密已被停用。" })),
    );

    renderGate();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "该卡密已被停用。",
    );
    expect(loadActivation()).toBeNull();
  });

  it("keeps a stale key working while the server is unreachable", async () => {
    const staleVerifiedAt = new Date(
      Date.now() - (LICENSE_REVALIDATE_AFTER_DAYS + 1) * 86_400_000,
    ).toISOString();
    saveActivation(storedActivation({ verifiedAt: staleVerifiedAt }));
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);

    renderGate();

    expect(await screen.findByText("付费内容")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText("付费内容")).toBeInTheDocument();
    expect(loadActivation()).not.toBeNull();
  });

  it("opens the app for an approved account, with no license key at all", async () => {
    signedIn(true);

    renderGate();

    expect(await screen.findByText("付费内容")).toBeInTheDocument();
  });

  it("holds a signed-in but unapproved account at the waiting screen", async () => {
    // This is the whole model: registering never grants access, because
    // `profiles.approved` starts false and only the seller can flip it.
    signedIn(false);

    renderGate();

    expect(
      await screen.findByRole("heading", { name: "账号已创建，等待开通" }),
    ).toBeInTheDocument();
    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.queryByText("付费内容")).not.toBeInTheDocument();
  });

  it("tells a waiting buyer exactly how to get approved", async () => {
    signedIn(false);

    renderGate();

    expect(await screen.findByText("el_hazel")).toBeInTheDocument();
    expect(screen.getByText(/告诉我你注册用的邮箱/)).toBeInTheDocument();
  });

  it("offers sign-in beside the key box once accounts are configured", async () => {
    accountsOn.mockReturnValue(true);

    renderGate();

    expect(
      await screen.findByRole("tab", { name: "登录" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "注册" })).toBeInTheDocument();
    expect(screen.getByText("已经买过卡密？点这里输入")).toBeInTheDocument();
  });

  it("still admits a license key holder while accounts exist beside it", async () => {
    // Keys were sold before accounts existed. Shipping accounts must not
    // strand a single one of those buyers.
    accountsOn.mockReturnValue(true);
    saveActivation(storedActivation());

    renderGate();

    expect(await screen.findByText("付费内容")).toBeInTheDocument();
    expect(session).not.toHaveBeenCalled();
  });

  it("skips the account round trip entirely when accounts are off", async () => {
    renderGate();

    expect(
      await screen.findByRole("heading", { name: /一次付清，永久使用/ }),
    ).toBeInTheDocument();
    expect(session).not.toHaveBeenCalled();
    expect(
      screen.getByText("本部署未启用账号功能，请使用卡密。"),
    ).toBeInTheDocument();
  });

  it("does not re-check a key that was verified recently", async () => {
    saveActivation(storedActivation());
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderGate();

    expect(await screen.findByText("付费内容")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("password reset links", () => {
  /** Arrive the way a reset email sends you: same page, tokens attached. */
  function arriveFromResetEmail(url: string) {
    window.history.replaceState({}, "", url);
  }

  it("shows the reset form instead of the app, even with a valid license key", async () => {
    // The dangerous case: a key in localStorage would otherwise open the app
    // and strand someone who came here specifically to change their password.
    saveActivation(storedActivation());
    arriveFromResetEmail("/#access_token=abc&refresh_token=def&type=recovery");

    renderGate();

    expect(
      await screen.findByRole("heading", { name: "设置新密码" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("付费内容")).not.toBeInTheDocument();
  });

  it("takes the tokens out of the address bar once they are used", async () => {
    arriveFromResetEmail("/#access_token=abc&refresh_token=def&type=recovery");

    renderGate();
    await screen.findByRole("heading", { name: "设置新密码" });

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(startRecovery).toHaveBeenCalled();
  });

  it("explains an expired link and offers a way to get another", async () => {
    arriveFromResetEmail(
      "/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );

    renderGate();

    expect(
      await screen.findByText(
        "这个重置链接已经过期了（链接一小时内有效）。请重新发一封。",
      ),
    ).toBeInTheDocument();
    // No form to fill in when there is nothing to fill it against.
    expect(screen.queryByLabelText("新密码")).not.toBeInTheDocument();
    expect(startRecovery).not.toHaveBeenCalled();
  });

  it("will not save two passwords that do not match", async () => {
    const user = userEvent.setup();
    arriveFromResetEmail("/#access_token=abc&refresh_token=def&type=recovery");

    renderGate();
    await screen.findByRole("heading", { name: "设置新密码" });

    await user.type(screen.getByLabelText("新密码"), "correct-horse");
    await user.type(screen.getByLabelText("再输一次"), "correct-hoarse");
    await user.click(screen.getByRole("button", { name: "保存新密码" }));

    expect(
      screen.getByText("两次输入的密码不一样，请检查一下。"),
    ).toBeInTheDocument();
    expect(completeReset).not.toHaveBeenCalled();
  });

  it("sends you back to sign in with the new password, and says so up front", async () => {
    const user = userEvent.setup();
    accountsOn.mockReturnValue(true);
    arriveFromResetEmail("/#access_token=abc&refresh_token=def&type=recovery");

    renderGate();
    await screen.findByRole("heading", { name: "设置新密码" });

    await user.type(screen.getByLabelText("新密码"), "correct-horse");
    await user.type(screen.getByLabelText("再输一次"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "保存新密码" }));

    expect(completeReset).toHaveBeenCalledWith("correct-horse");
    // Visible on the page itself, not tucked inside the collapsed key form.
    expect(
      await screen.findByText("密码已经改好了，请用新密码登录。"),
    ).toBeInTheDocument();
  });

  it("leaves an ordinary visit alone", async () => {
    saveActivation(storedActivation());
    arriveFromResetEmail("/");

    renderGate();

    expect(await screen.findByText("付费内容")).toBeInTheDocument();
    expect(startRecovery).not.toHaveBeenCalled();
  });
});
