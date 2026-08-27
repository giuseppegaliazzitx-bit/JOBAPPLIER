import { z } from "zod";
import { FieldTypeSchema, SelectorSpecSchema, WidgetKindSchema } from "./field.ts";

export const DISTILLED_PAGE_FIELD_CAP = 60;
export const DISTILLED_PAGE_BYTE_CAP = 8 * 1024;

export const DistilledFieldSchema = z.object({
  id: z.string().min(1),
  type: FieldTypeSchema,
  required: z.boolean(),
  label: z.string().nullable(),
  name: z.string().optional(),
  aria: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  accept: z.string().optional(),
  widget: WidgetKindSchema.optional(),
});

export type DistilledField = z.infer<typeof DistilledFieldSchema>;

export const DistilledPageSchema = z.object({
  title: z.string(),
  step: z.string().optional(),
  fields: z.array(DistilledFieldSchema).max(DISTILLED_PAGE_FIELD_CAP),
  buttons: z.array(z.string()),
  errors: z.array(z.string()),
});

export type DistilledPage = z.infer<typeof DistilledPageSchema>;

export const AiPurposeSchema = z.enum([
  "classify_page",
  "resolve_labels",
  "map_option",
  "repair_step",
  "draft_answer",
  "write_cover_letter",
]);

export type AiPurpose = z.infer<typeof AiPurposeSchema>;

export const ModelTierSchema = z.enum(["small", "medium", "large"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const PURPOSE_TIER = {
  classify_page: "small",
  resolve_labels: "small",
  map_option: "small",
  repair_step: "medium",
  draft_answer: "large",
  write_cover_letter: "large",
} as const satisfies Record<AiPurpose, ModelTier>;

export const PageClassSchema = z.enum([
  "login",
  "form_step",
  "review",
  "confirmation",
  "error",
  "captcha",
  "expired",
]);
export type PageClass = z.infer<typeof PageClassSchema>;

export const ClassifyPageOutputSchema = z.object({
  class: PageClassSchema,
});

export const ResolveLabelsOutputSchema = z.object({
  labels: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })),
});

export const MapOptionOutputSchema = z.object({
  index: z.number().int().nonnegative().nullable(),
});

export const RepairPatchSchema = z.object({
  selector: SelectorSpecSchema,
  action: z.enum(["fill", "click", "select", "upload"]),
  widget: WidgetKindSchema.optional(),
  notes: z.string().optional(),
});
export type RepairPatch = z.infer<typeof RepairPatchSchema>;

export const DraftAnswerOutputSchema = z.object({
  draft: z.string().min(1),
  needsApproval: z.literal(true),
});

export const CoverLetterOutputSchema = z.object({
  letter: z.string().min(1),
});

export const AiCallLogSchema = z.object({
  purpose: AiPurposeSchema,
  model: z.string(),
  inTokens: z.number().int().nonnegative(),
  outTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  cacheHit: z.boolean(),
  runId: z.string().optional(),
});
export type AiCallLog = z.infer<typeof AiCallLogSchema>;

export const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/;
export const PII_EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
export const PII_PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
export const PII_SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
