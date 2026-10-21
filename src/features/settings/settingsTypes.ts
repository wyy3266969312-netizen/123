import type { CampaignSettingsPageProps } from "../campaigns/campaignSettingsTypes";
import type { ThemePreference } from "../../theme";

export type SettingsPromptHelperField =
  | "sellingPoints"
  | "videoCount"
  | "durationRequirement"
  | "targetSceneOrAudience"
  | "mustShowShots"
  | "avoidShots"
  | "referenceLinks";

export type SettingsPromptHelperForm = Record<
  SettingsPromptHelperField,
  string
>;

export type SettingsData = {
  campaignSettingsProps: CampaignSettingsPageProps;
  generatedPrompt: string;
  promptCopyStatus: string;
  theme: ThemePreference;
};

export type SettingsUiState = {
  promptHelperOpen: boolean;
  promptHelperForm: SettingsPromptHelperForm;
};

export type SettingsActions = {
  togglePromptHelper: () => void;
  updatePromptHelperField: (
    field: SettingsPromptHelperField,
    value: string,
  ) => void;
  generatePrompt: () => void;
  copyPrompt: () => void;
  clearLocalCreatorData: () => void;
  setTheme: (preference: ThemePreference) => void;
};

export type SettingsPageProps = {
  data: SettingsData;
  uiState: SettingsUiState;
  actions: SettingsActions;
};
