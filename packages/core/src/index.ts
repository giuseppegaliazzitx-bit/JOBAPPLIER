export {
  CURRENT_PHASE,
  AppConfigSchema,
  EnvSchema,
  type AppConfig,
  type EnvConfig,
} from "./config.ts";
export {
  PlatformSchema,
  ATS_PLATFORMS,
  JobSourceSchema,
  ApplyKindSchema,
  type Platform,
  type JobSource,
  type ApplyKind,
} from "./platform.ts";
export {
  ProfileSectionSchema,
  ProfileInputKindSchema,
  WorkHistoryEntrySchema,
  EducationEntrySchema,
  YesNoSchema,
  EeoFillModeSchema,
  PROFILE_FIELDS,
  ProfileValuesSchema,
  profileField,
  isProfileKey,
  isJsonProfileKey,
  serializeProfileValue,
  parseStoredProfileValue,
  profileValuesFromStore,
  requiredProfileKeys,
  type ProfileSection,
  type ProfileInputKind,
  type WorkHistoryEntry,
  type EducationEntry,
  type ProfileFieldDef,
  type ProfileKey,
  type ProfileValues,
} from "./profile.ts";
export { extractJobUrls, parseUrl, canonicalizeUrl, detectJobSource } from "./urls.ts";
export { atsRefFromUrl, atsRefsFromHtml, platformFromUrl, type AtsRef } from "./ats.ts";
export { detectPlatformFromUrl, detectPlatformFromDom, detectPlatform } from "./platform-detect.ts";
export { deriveDedupKey, atsKey, metaKey, type DedupInput } from "./dedup.ts";
export { extractJobMetadata, type JobMetadata } from "./job-metadata.ts";
export {
  STALE_DAYS,
  tokenize,
  uniqueTokens,
  jaccard,
  keywordOverlap,
  titleSimilarity,
  salaryFloorFit,
  computeFitScore,
  keywordGap,
  selectResumeVariant,
  jobFamily,
  isStaffingAgency,
  isStale,
  locationMismatch,
  coverLetterTemplate,
  type ResumeDoc,
} from "./fit.ts";
export {
  FunnelSchema,
  SliceRateSchema,
  MetricsSnapshotSchema,
  computeFunnel,
  funnelIsMonotonic,
  computeMetrics,
  type Funnel,
  type SliceRate,
  type MetricsSnapshot,
  type MetricsApplication,
  type MetricsAiCall,
  type MetricsRun,
  type MetricsInput,
} from "./metrics.ts";
export { classifyApplyKind } from "./apply-kind.ts";
export {
  JobPublicSchema,
  IngestResultSchema,
  type JobPublic,
  type IngestResult,
} from "./job.ts";
export { collapseWs, stripTags, normalizeText, normalizeCompanyName } from "./normalize.ts";
export {
  JobStatusSchema,
  RunModeSchema,
  RunStatusSchema,
  ApplicationStatusSchema,
  RecipeVersionStatusSchema,
  FieldResolveStatusSchema,
  type JobStatus,
  type RunMode,
  type RunStatus,
  type ApplicationStatus,
  type RecipeVersionStatus,
  type FieldResolveStatus,
} from "./status.ts";
export {
  FieldTypeSchema,
  WidgetKindSchema,
  SelectorStrategySchema,
  SelectorSchema,
  SelectorSpecSchema,
  FieldOptionSchema,
  LabelSourceSchema,
  HIGH_CONFIDENCE_LABEL_SOURCES,
  FieldDescriptorSchema,
  FieldInventorySchema,
  type FieldType,
  type WidgetKind,
  type SelectorStrategy,
  type Selector,
  type SelectorSpec,
  type FieldOption,
  type LabelSource,
  type FieldDescriptor,
  type FieldInventory,
} from "./field.ts";
export { normalizeLabel, optionsHash, fieldFingerprint } from "./fingerprint.ts";
export { humanizeIdent, resolveLabel, type LabelFacts, type ResolvedLabel } from "./label-ladder.ts";
export {
  isNthChildSelector,
  buildSelectorSpec,
  cssAttributeSelector,
  type SelectorFacts,
} from "./selectors.ts";
export { classifyWidget, type WidgetFacts, type ClassifiedControl } from "./widget.ts";
export {
  AnswerScopeSchema,
  MatchTierSchema,
  AnswerRecordSchema,
  type AnswerScope,
  type MatchTier,
  type AnswerRecord,
} from "./answer.ts";
export { normalizeQuestion } from "./question-normalize.ts";
export { polarityTags, polaritiesConflict, type PolarityTag } from "./polarity.ts";
export { typesCompatible } from "./type-compat.ts";
export { cosine } from "./cosine.ts";
export { mapOption, type OptionEmbedFn, type OptionMapResult } from "./option-map.ts";
export {
  QUESTION_CLUSTERS,
  PROFILE_CLUSTERS,
  clusterFor,
  defaultTypeForCluster,
} from "./aliases.ts";
export {
  matchField,
  type EmbedFn,
  type StoredAnswer,
  type LiveField,
  type MatchDecision,
} from "./match.ts";
export {
  ResolutionSchema,
  answersFromProfile,
  resolveInventory,
  questionCanBeAnsweredByProfile,
  type Resolution,
} from "./resolution.ts";
export { buildMatchingCorpus, type CorpusPair, type CorpusItem } from "./matching-corpus.ts";
export {
  BlockedJobSchema,
  QuestionCardSchema,
  type BlockedJob,
  type QuestionCard,
} from "./question-card.ts";
export {
  RecipeScopeSchema,
  DomFingerprintSchema,
  RecipeMatchSchema,
  RecipeSchema,
  StepTypeSchema,
  ValueSourceSchema,
  AssertionSchema,
  StepFailActionSchema,
  StepSchema,
  RecipeCreatedBySchema,
  RecipeVersionSchema,
  RecipeBundleSchema,
  SHADOW_STREAK,
  ACTIVE_WINDOW,
  ACTIVE_FAIL_RATE,
  canonicalizeValueSource,
  type RecipeScope,
  type DomFingerprint,
  type RecipeMatch,
  type Recipe,
  type StepType,
  type ValueSource,
  type Assertion,
  type StepFailAction,
  type Step,
  type RecipeCreatedBy,
  type RecipeVersion,
  type RecipeBundle,
} from "./recipe.ts";
export {
  urlPatternMatches,
  recipeMatchesUrl,
  recipeMatchesDom,
  matchRecipe,
} from "./recipe-match.ts";
export {
  profileLiterals,
  parameterizeValue,
  profileValuesInText,
  resolveValueSource,
  type ProfileLiteral,
  type DocumentLiteral,
  type ParameterizeHit,
} from "./recipe-parameterize.ts";
export {
  consecutiveSuccesses,
  failRate,
  evaluateLifecycle,
  type LifecycleOutcome,
  type LifecycleDecision,
} from "./recipe-lifecycle.ts";
export {
  DEFAULT_DAILY_CAP,
  shuffleBatch,
  humanDelayMs,
  hostFromUrl,
} from "./rate-limit.ts";
export {
  evaluateSubmitGate,
  submitGateFromHistory,
  type SubmitGate,
  type SubmitVerdict,
} from "./submit-gate.ts";
export {
  fieldKeys,
  applyInventoryOverrides,
  applyStepSelectors,
  applyResolveOverrides,
  stepMatchesField,
} from "./recipe-apply.ts";
export {
  HealTierSchema,
  HealAttemptSchema,
  HealReportSchema,
  FailureReasonSchema,
  selectorKey,
  promoteSelector,
  applyRepairsToRecipe,
  type HealTier,
  type HealAttempt,
  type HealReport,
  type FailureReason,
} from "./heal.ts";
export {
  MAX_WIZARD_STEPS,
  FillResultSchema,
  PreflightRowSchema,
  PreflightSchema,
  RunEventSchema,
  RunPublicSchema,
  WalkHistoryItemSchema,
  RunCheckpointSchema,
  type FillResult,
  type PreflightRow,
  type Preflight,
  type RunEvent,
  type RunPublic,
  type WalkHistoryItem,
  type RunCheckpoint,
} from "./run.ts";
export {
  MailKindSchema,
  MailMessageSchema,
  MailClassificationSchema,
  StatusSourceSchema,
  FOLLOW_UP_SILENCE_DAYS,
  GMAIL_READONLY_SCOPE,
  ClassifyMailResultSchema,
  mailPlainText,
  extractVerificationCode,
  extractInterviewAt,
  classifyMail,
  statusForMailKind,
  applyMailTransition,
  isSilentSince,
  gmailAuthUrl,
  type MailKind,
  type MailMessage,
  type MailClassification,
  type StatusSource,
  type ClassifyMailResult,
} from "./mail.ts";
export {
  DISTILLED_PAGE_FIELD_CAP,
  DISTILLED_PAGE_BYTE_CAP,
  DistilledFieldSchema,
  DistilledPageSchema,
  AiPurposeSchema,
  ModelTierSchema,
  PURPOSE_TIER,
  PageClassSchema,
  ClassifyPageOutputSchema,
  ResolveLabelsOutputSchema,
  MapOptionOutputSchema,
  RepairPatchSchema,
  DraftAnswerOutputSchema,
  CoverLetterOutputSchema,
  AiCallLogSchema,
  HTML_TAG_RE,
  PII_EMAIL_RE,
  type DistilledField,
  type DistilledPage,
  type AiPurpose,
  type ModelTier,
  type PageClass,
  type RepairPatch,
  type AiCallLog,
} from "./distilled-page.ts";
export {
  scrubPii,
  renderDistilledField,
  renderDistilledPage,
  distilledByteSize,
  paginateDistilled,
  hashDistilledInput,
  inventoryToDistilled,
  distilledNeedsScreenshot,
  assertDistilledSafe,
} from "./distill.ts";
