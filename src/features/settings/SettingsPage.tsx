import { CampaignSettingsPage } from "../campaigns/CampaignSettingsPage";
import type {
  SettingsPageProps,
  SettingsPromptHelperField,
} from "./settingsTypes";
import { THEME_OPTIONS } from "../../theme";

export function SettingsPage({ data, uiState, actions }: SettingsPageProps) {
  const { campaignSettingsProps, generatedPrompt, promptCopyStatus } = data;
  const { promptHelperOpen, promptHelperForm } = uiState;

  const textField = (field: SettingsPromptHelperField, label: string) => (
    <label>
      {label}
      <input
        value={promptHelperForm[field]}
        onChange={(event) =>
          actions.updatePromptHelperField(field, event.target.value)
        }
      />
    </label>
  );

  return (
    <>
      <CampaignSettingsPage {...campaignSettingsProps} />
      <section className="panel prompt-helper">
        <div className="section-heading">
          <div>
            <h2>辅助生成拍摄要求（可选）</h2>
            <p className="muted">
              填好产品信息，生成一段提示词，复制到 ChatGPT
              里跑，再把结果填回上方的产品项目设置。
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={actions.togglePromptHelper}
          >
            {promptHelperOpen ? "收起辅助生成" : "展开辅助生成"}
          </button>
        </div>
        {promptHelperOpen && (
          <div className="settings-form">
            {textField("sellingPoints", "产品卖点")}
            {textField("videoCount", "目标视频数量")}
            {textField("durationRequirement", "单条视频时长要求")}
            {textField("targetSceneOrAudience", "目标使用场景 / 人群")}
            {textField("mustShowShots", "必须展示的画面")}
            {textField("avoidShots", "不希望达人这样拍")}
            <label>
              对标视频链接（可选，每行一个）
              <textarea
                value={promptHelperForm.referenceLinks}
                onChange={(event) =>
                  actions.updatePromptHelperField(
                    "referenceLinks",
                    event.target.value,
                  )
                }
              />
            </label>

            <div className="inline-actions">
              <button type="button" onClick={actions.generatePrompt}>
                生成可复制提示词
              </button>
            </div>
            <p className="muted">
              生成后复制到 ChatGPT（或任何你在用的
              AI）里跑，把结果填回上方的产品项目设置。
              这一步不消耗任何接口额度。
            </p>

            {generatedPrompt && (
              <>
                <p className="ai-status">
                  提示词已生成。请复制到 ChatGPT 使用。
                </p>
                <label>
                  ChatGPT 提示词
                  <textarea value={generatedPrompt} readOnly rows={8} />
                </label>
                <button type="button" onClick={actions.copyPrompt}>
                  复制提示词
                </button>
                {promptCopyStatus && (
                  <p className="ai-status">{promptCopyStatus}</p>
                )}
              </>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>外观</h2>
            <p className="muted">
              深浅色只影响这台电脑上的显示，不改任何达人数据。
            </p>
          </div>
        </div>
        <div className="theme-options" role="radiogroup" aria-label="外观主题">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={data.theme === option.value}
              className={
                data.theme === option.value
                  ? "theme-option active"
                  : "theme-option secondary"
              }
              onClick={() => actions.setTheme(option.value)}
            >
              <strong>{option.label}</strong>
              <small>{option.helper}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="panel danger-zone">
        <div className="section-heading">
          <div>
            <h2>危险操作</h2>
            <p className="muted">
              仅清空当前浏览器 localStorage 中的达人数据，不影响产品项目设置。
            </p>
          </div>
          <button
            type="button"
            className="secondary danger"
            onClick={actions.clearLocalCreatorData}
          >
            清空当前数据
          </button>
        </div>
      </section>
    </>
  );
}
