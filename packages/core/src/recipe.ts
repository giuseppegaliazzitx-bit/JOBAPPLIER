import { z } from "zod";
import { WidgetKindSchema } from "./field.ts";
import { PlatformSchema } from "./platform.ts";
import { RecipeVersionStatusSchema } from "./status.ts";
import { SelectorSpecSchema } from "./field.ts";

export const RecipeScopeSchema = z.enum(["platform", "company", "url_pattern"]);

export type RecipeScope = z.infer<typeof RecipeScopeSchema>;

export const DomFingerprintSchema = z.object({
  kind: z.enum(["meta_generator", "script_host", "form_action_host", "attr_prefix", "css"]),
  value: z.string().min(1),
});

export type DomFingerprint = z.infer<typeof DomFingerprintSchema>;

export const RecipeMatchSchema = z.object({
  urlPatterns: z.array(z.string()),
  domFingerprints: z.array(DomFingerprintSchema),
});

export type RecipeMatch = z.infer<typeof RecipeMatchSchema>;

export const RecipeSchema = z.object({
  id: z.string().min(1),
  scope: RecipeScopeSchema,
  platform: PlatformSchema,
  match: RecipeMatchSchema,
});

export type Recipe = z.infer<typeof RecipeSchema>;

export const StepTypeSchema = z.enum([
  "navigate",
  "click",
  "fill",
  "select",
  "upload",
  "wait",
  "assert",
  "advance",
  "submit",
]);

export type StepType = z.infer<typeof StepTypeSchema>;

export const ValueSourceSchema = z.union([
  z.literal("answer_bank"),
  z.string().regex(/^profile\.[A-Za-z0-9_.]+$/),
  z.string().regex(/^literal:.+$/),
  z.string().regex(/^document\.[A-Za-z0-9_.]+$/),
]);

export type ValueSource = z.infer<typeof ValueSourceSchema>;

export const AssertionSchema = z.object({
  kind: z.enum(["visible", "hidden", "url", "text", "count"]),
  selector: SelectorSpecSchema.optional(),
  value: z.string().optional(),
});

export type Assertion = z.infer<typeof AssertionSchema>;

export const StepFailActionSchema = z.enum(["heal", "skip", "pause"]);

export type StepFailAction = z.infer<typeof StepFailActionSchema>;

export const StepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: StepTypeSchema,
  selector: SelectorSpecSchema.optional(),
  valueSource: ValueSourceSchema.optional(),
  guard: AssertionSchema.optional(),
  optional: z.boolean(),
  onFail: StepFailActionSchema,
});

export type Step = z.infer<typeof StepSchema>;

export const RecipeCreatedBySchema = z.enum(["record", "ai_repair", "manual", "promotion"]);

export type RecipeCreatedBy = z.infer<typeof RecipeCreatedBySchema>;

export const RecipeVersionSchema = z.object({
  recipeId: z.string().min(1),
  version: z.number().int().positive(),
  status: RecipeVersionStatusSchema,
  steps: z.array(StepSchema),
  labelHints: z.record(z.string(), z.string()),
  widgetHandlers: z.record(z.string(), WidgetKindSchema),
  createdBy: RecipeCreatedBySchema,
  stats: z.object({
    runs: z.number().int().nonnegative(),
    successes: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    lastSuccessAt: z.string().optional(),
  }),
  fixturePath: z.string().optional(),
  autopilot: z.boolean().default(false),
});

export type RecipeVersion = z.infer<typeof RecipeVersionSchema>;

export const RecipeBundleSchema = z.object({
  recipe: RecipeSchema,
  version: RecipeVersionSchema,
});

export type RecipeBundle = z.infer<typeof RecipeBundleSchema>;

export const SHADOW_STREAK = 3;
export const ACTIVE_WINDOW = 10;
export const ACTIVE_FAIL_RATE = 0.3;

export function canonicalizeValueSource(raw: string): string {
  const mustache = raw.trim().match(/^\{\{\s*(profile\.[A-Za-z0-9_.]+|document\.[A-Za-z0-9_.]+)\s*\}\}$/);
  if (mustache?.[1]) {
    return mustache[1];
  }
  return raw.trim();
}
