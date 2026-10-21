import type { RefObject } from "react";
import type { ReplyTone } from "../../messageGenerator";
import type { CreatorTier } from "../../messageVariants";
import type { Channel, GeneratedMessage } from "../../types";

export type MessageComposerLoadingAction =
  "translate_creator_reply" | "generate_personalized_reply" | null;

export type MessageComposerData = {
  creatorReply: string;
  notes: string;
  channel: Channel;
  chineseTranslation: string;
  errorMessage: string;
  message: GeneratedMessage | null;
  messageSource: "local" | "deepseek";
  chineseExplanation: string;
  trackingStatus: string;
  lastProcessingResult: string;
  hasNextTask: boolean;
};

export type VideoProgressDraft = {
  progress: string;
  firstDate: string;
  latestDate: string;
  note: string;
};

export type MessageComposerUiState = {
  historicalReadOnly: boolean;
  loadingAction: MessageComposerLoadingAction;
  /**
   * Why the DeepSeek buttons cannot be used right now, or "" when they can.
   * Shown next to them and used to disable them, so a demo session stops
   * offering a call that can only come back 401.
   */
  deepSeekUnavailableReason: string;
  translationExpanded: boolean;
  translationEditing: boolean;
  advancedReplyOpen: boolean;
  replyFocus: string;
  relationshipNote: string;
  replyTone: ReplyTone;
  replyGoal: string;
  replyConcession: string;
  creatorTier: CreatorTier;
  showNextCreatorPrompt: boolean;
  /**
   * The manual video-progress edit, or null when it is closed. This used to be
   * four `window.prompt` dialogs in a row — no way to see the fields together,
   * no validation on the dates, and cancelling on the fourth threw away the
   * first three answers.
   */
  videoProgressDraft: VideoProgressDraft | null;
  messageOutputRef: RefObject<HTMLDivElement | null>;
};

export type MessageComposerActions = {
  updateCreatorReply: (value: string) => void;
  updateNotes: (value: string) => void;
  generateDeepSeekReply: () => void;
  translateCreatorReply: () => void;
  copyTranslation: () => void;
  updateTranslation: (value: string) => void;
  setTranslationExpanded: (value: boolean) => void;
  setTranslationEditing: (value: boolean) => void;
  setReplyFocus: (value: string) => void;
  setReplyTone: (value: ReplyTone) => void;
  setAdvancedReplyOpen: (value: boolean) => void;
  setRelationshipNote: (value: string) => void;
  setReplyGoal: (value: string) => void;
  setReplyConcession: (value: string) => void;
  setCreatorTier: (value: CreatorTier) => void;
  /** Jump to a specific script angle for the current scenario. */
  selectMessageVariant: (index: number) => void;
  /** Advance to the next script angle, wrapping at the end. */
  cycleMessageVariant: () => void;
  updateEnglishMessage: (value: string) => void;
  copyEnglishMessage: () => void;
  copyEmailSubject: () => void;
  markMessageSent: () => void;
  markCreatorReplied: () => void;
  markCreatorNoReply: () => void;
  markVideoProgress: () => void;
  updateVideoProgressManually: () => void;
  updateVideoProgressDraft: (
    field: keyof VideoProgressDraft,
    value: string,
  ) => void;
  submitVideoProgressDraft: () => void;
  cancelVideoProgressDraft: () => void;
  markCreatorOutcome: (outcome: "Completed" | "Failed") => void;
  markCreatorSkippedToday: () => void;
  processNextCreator: () => void;
  stayOnCurrentCreator: () => void;
};

export type MessageComposerProps = {
  data: MessageComposerData;
  uiState: MessageComposerUiState;
  actions: MessageComposerActions;
};
