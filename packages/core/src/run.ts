import { z } from "zod";
import { SelectorSpecSchema } from "./field.ts";
import { FieldResolveStatusSchema } from "./status.ts";
import { ResolutionSchema } from "./resolution.ts";

export const MAX_WIZARD_STEPS = 8;

export const FillResultSchema = z.object({
  fingerprint: z.string(),
  labelRaw: z.string(),
  attempted: z.string(),
  readBack: z.string().nullable(),
  ok: z.boolean(),
  error: z.string().nullable(),
  chipVerified: z.boolean().optional(),
  healTier: z.number().int().optional(),
  workingSelector: SelectorSpecSchema.optional(),
});

export type FillResult = z.infer<typeof FillResultSchema>;

export const PreflightRowSchema = z.object({
  fingerprint: z.string(),
  labelRaw: z.string(),
  value: z.string().optional(),
  source: z.string().optional(),
  confidence: z.number(),
  status: FieldResolveStatusSchema,
  readBack: z.string().nullable().optional(),
  verified: z.boolean(),
});

export type PreflightRow = z.infer<typeof PreflightRowSchema>;

export const PreflightSchema = z.object({
  runId: z.string(),
  url: z.string(),
  title: z.string(),
  screenshotDataUrl: z.string().optional(),
  rows: z.array(PreflightRowSchema),
  ready: z.boolean(),
});

export type Preflight = z.infer<typeof PreflightSchema>;

export const RunEventSchema = z.object({
  seq: z.number().int(),
  type: z.string(),
  stepId: z.string().optional(),
  status: z.string(),
  durationMs: z.number().optional(),
  screenshotPath: z.string().optional(),
  thumbnailDataUrl: z.string().optional(),
  detail: z.unknown().optional(),
});

export type RunEvent = z.infer<typeof RunEventSchema>;

export const RunPublicSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  mode: z.string(),
  status: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  checkpointJson: z.string().nullable(),
  events: z.array(RunEventSchema),
  preflight: PreflightSchema.optional(),
});

export type RunPublic = z.infer<typeof RunPublicSchema>;

export const WalkHistoryItemSchema = z.object({
  labelRaw: z.string(),
  fingerprint: z.string(),
  resolution: ResolutionSchema,
  fill: FillResultSchema,
});

export type WalkHistoryItem = z.infer<typeof WalkHistoryItemSchema>;

export const RunCheckpointSchema = z.object({
  url: z.string(),
  kind: z.string(),
  step: z.number().int().nonnegative(),
  history: z.array(WalkHistoryItemSchema),
  storageState: z.unknown().optional(),
});

export type RunCheckpoint = z.infer<typeof RunCheckpointSchema>;

export { ResolutionSchema };
