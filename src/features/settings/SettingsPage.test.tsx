import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import type { SettingsPageProps } from "./settingsTypes";

function createProps(
  overrides: Partial<SettingsPageProps> = {},
): SettingsPageProps {
  const base: SettingsPageProps = {
    data: {
      campaignSettingsProps: {
        data: {
          target: null,
          campaignOptions: [],
          storeOptions: [],
          storeCleanupItems: [],
        },
        uiState: { showArchivedProducts: false },
        actions: {
          selectCampaign: vi.fn(),
          setShowArchivedProducts: vi.fn(),
          createCampaign: vi.fn(),
          announceEditable: vi.fn(),
          duplicateCampaign: vi.fn(),
          archiveCampaign: vi.fn(),
          restoreCampaign: vi.fn(),
          deleteCampaign: vi.fn(),
          assignStore: vi.fn(),
          renameProduct: vi.fn(),
          selectCategory: vi.fn(),
          applyCategoryPreset: vi.fn(),
          selectPlatform: vi.fn(),
          selectCollabModel: vi.fn(),
          selectOrderMethod: vi.fn(),
          updateDiscountCode: vi.fn(),
          updateAudienceDiscount: vi.fn(),
          updateCreatorCommission: vi.fn(),
          updateCommissionWindow: vi.fn(),
          updateContentUsageMonths: vi.fn(),
          setRequiresDisclosure: vi.fn(),
          updateKeyContentPoints: vi.fn(),
          updateSellingPoints: vi.fn(),
          updateVideoLength: vi.fn(),
          updateVideoCount: vi.fn(),
          syncVideoCount: vi.fn(),
          endCurrentRound: vi.fn(),
          updateAvoidShots: vi.fn(),
          updateProductLinkRequirement: vi.fn(),
          updateReferenceLinks: vi.fn(),
          inspectStore: vi.fn(),
        },
      },
      generatedPrompt: "",
      promptCopyStatus: "",
      theme: "system" as const,
    },
    uiState: {
      promptHelperOpen: false,
      promptHelperForm: {
        sellingPoints: "",
        videoCount: "",
        durationRequirement: "",
        targetSceneOrAudience: "",
        mustShowShots: "",
        avoidShots: "",
        referenceLinks: "",
      },
    },
    actions: {
      togglePromptHelper: vi.fn(),
      updatePromptHelperField: vi.fn(),
      generatePrompt: vi.fn(),
      copyPrompt: vi.fn(),
      clearLocalCreatorData: vi.fn(),
      setTheme: vi.fn(),
    },
  };

  return { ...base, ...overrides };
}

describe("SettingsPage", () => {
  it("offers only the prompt path, which costs nothing to run", async () => {
    // The OpenAI-backed draft button was removed: the deployment has no
    // OPENAI_API_KEY, so it could only ever fail in front of a paying user.
    // The prompt builder needs no key at all and is now the whole feature.
    const props = createProps();
    props.uiState.promptHelperOpen = true;

    render(<SettingsPage {...props} />);

    expect(
      screen.getByRole("button", { name: "生成可复制提示词" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /用 AI 直接生成草稿/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/OPENAI_API_KEY/)).not.toBeInTheDocument();
  });

  it("composes campaign settings and keeps the prompt helper collapsed by default", () => {
    render(<SettingsPage {...createProps()} />);

    expect(
      screen.getByRole("heading", { name: "产品项目设置" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "辅助生成拍摄要求（可选）" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开辅助生成" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("产品卖点")).not.toBeInTheDocument();
  });

  it("forwards prompt helper edits and generation without interpreting them", async () => {
    const user = userEvent.setup();
    const props = createProps();
    props.uiState.promptHelperOpen = true;
    props.uiState.promptHelperForm.sellingPoints = "Steam softens loose hair";

    render(<SettingsPage {...props} />);

    expect(screen.getByRole("button", { name: "收起辅助生成" })).toBeVisible();
    expect(screen.getByLabelText("产品卖点")).toHaveValue(
      "Steam softens loose hair",
    );

    await user.type(screen.getByLabelText("单条视频时长要求"), "6");
    expect(props.actions.updatePromptHelperField).toHaveBeenCalledWith(
      "durationRequirement",
      "6",
    );

    await user.click(screen.getByRole("button", { name: "生成可复制提示词" }));
    expect(props.actions.generatePrompt).toHaveBeenCalledTimes(1);
  });

  it("shows the generated prompt read-only with copy status", async () => {
    const user = userEvent.setup();
    const props = createProps();
    props.uiState.promptHelperOpen = true;
    props.data.generatedPrompt = "请你作为熟悉美国 TikTok Shop 的内容运营…";
    props.data.promptCopyStatus = "已复制提示词。";

    render(<SettingsPage {...props} />);

    expect(screen.getByLabelText("ChatGPT 提示词")).toHaveAttribute("readonly");
    expect(
      screen.getByText("提示词已生成。请复制到 ChatGPT 使用。"),
    ).toBeVisible();
    expect(screen.getByText("已复制提示词。")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "复制提示词" }));
    expect(props.actions.copyPrompt).toHaveBeenCalledTimes(1);
  });

  it("exposes every field the filming-requirements endpoint accepts", () => {
    const props = createProps();
    props.uiState.promptHelperOpen = true;

    render(<SettingsPage {...props} />);

    for (const label of [
      "产品卖点",
      "目标视频数量",
      "单条视频时长要求",
      "目标使用场景 / 人群",
      "必须展示的画面",
      "不希望达人这样拍",
      "对标视频链接（可选，每行一个）",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("forwards the danger-zone clear action", async () => {
    const user = userEvent.setup();
    const props = createProps();

    render(<SettingsPage {...props} />);

    expect(screen.getByRole("heading", { name: "危险操作" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "清空当前数据" }));
    expect(props.actions.clearLocalCreatorData).toHaveBeenCalledTimes(1);
  });
});

describe("appearance", () => {
  it("offers the three theme choices and marks the current one", () => {
    const props = createProps({
      data: { ...createProps().data, theme: "dark" },
    });
    render(<SettingsPage {...props} />);

    const group = screen.getByRole("radiogroup", { name: "外观主题" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: /深色/ })).toBeChecked();
    expect(
      within(group).getByRole("radio", { name: /跟随系统/ }),
    ).not.toBeChecked();
  });

  it("reports the chosen theme", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<SettingsPage {...props} />);

    await user.click(screen.getByRole("radio", { name: /深色/ }));

    expect(props.actions.setTheme).toHaveBeenCalledWith("dark");
  });
});
