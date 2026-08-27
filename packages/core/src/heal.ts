import { z } from "zod";
import { SelectorSpecSchema, type Selector, type SelectorSpec } from "./field.ts";
import type { RecipeVersion, Step } from "./recipe.ts";

export const HealTierSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type HealTier = z.infer<typeof HealTierSchema>;

export const HealAttemptSchema = z.object({
  tier: HealTierSchema,
  tried: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
});
export type HealAttempt = z.infer<typeof HealAttemptSchema>;

export const HealReportSchema = z.object({
  fingerprint: z.string(),
  labelRaw: z.string(),
  attempts: z.array(HealAttemptSchema),
  paused: z.boolean(),
  winningTier: HealTierSchema.optional(),
  originalSelector: SelectorSpecSchema,
  workingSelector: SelectorSpecSchema.optional(),
});
export type HealReport = z.infer<typeof HealReportSchema>;

export const FailureReasonSchema = z.enum([
  "selector",
  "validation",
  "timeout",
  "unknown_widget",
  "budget",
  "heal_exhausted",
  "unanswered",
  "network",
  "captcha",
  "two_factor",
  "email_otp",
  "rate_limited",
]);
export type FailureReason = z.infer<typeof FailureReasonSchema>;

export function selectorKey(selector: Selector): string {
  return `${selector.strategy}=${selector.value}`;
}

export function promoteSelector(original: SelectorSpec, working: Selector): SelectorSpec {
  const oldPrimary = original.primary;
  const rest = [oldPrimary, ...original.fallbacks].filter(
    (item) => !(item.strategy === working.strategy && item.value === working.value),
  );
  return { primary: working, fallbacks: rest };
}

export function applyRepairsToRecipe(version: RecipeVersion, reports: HealReport[]): RecipeVersion {
  const steps: Step[] = version.steps.map((step) => {
    if (!step.selector) {
      return step;
    }
    const report = reports.find((item) => {
      if (!item.workingSelector || item.paused) {
        return false;
      }
      const winning = item.winningTier;
      if (winning === undefined || winning < 1 || winning > 3) {
        return false;
      }
      return (
        item.originalSelector.primary.strategy === step.selector?.primary.strategy &&
        item.originalSelector.primary.value === step.selector.primary.value
      );
    });
    if (!report?.workingSelector) {
      return step;
    }
    return {
      ...step,
      selector: promoteSelector(step.selector, report.workingSelector.primary),
    };
  });
  return {
    ...version,
    status: "proposed",
    createdBy: "ai_repair",
    version: version.version + 1,
    stats: { runs: 0, successes: 0, failures: 0 },
    steps,
  };
}
