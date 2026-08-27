import {
  ACTIVE_FAIL_RATE,
  ACTIVE_WINDOW,
  SHADOW_STREAK,
} from "./recipe.ts";
import type { RecipeVersionStatus } from "./status.ts";

export type LifecycleOutcome = "success" | "failure";

export function consecutiveSuccesses(outcomes: LifecycleOutcome[]): number {
  let n = 0;
  for (let i = outcomes.length - 1; i >= 0; i -= 1) {
    if (outcomes[i] !== "success") {
      break;
    }
    n += 1;
  }
  return n;
}

export function failRate(outcomes: LifecycleOutcome[], window = ACTIVE_WINDOW): number | null {
  if (outcomes.length < window) {
    return null;
  }
  const slice = outcomes.slice(-window);
  const failures = slice.filter((item) => item === "failure").length;
  return failures / slice.length;
}

export type LifecycleDecision =
  | { action: "promote"; to: "shadow" | "active" }
  | { action: "degrade" }
  | { action: "rollback" }
  | { action: "none" };

export function evaluateLifecycle(options: {
  status: RecipeVersionStatus;
  fixturePassed: boolean;
  outcomes: LifecycleOutcome[];
  hasPriorActive: boolean;
}): LifecycleDecision {
  const { status, fixturePassed, outcomes, hasPriorActive } = options;
  if (status === "proposed") {
    return fixturePassed ? { action: "promote", to: "shadow" } : { action: "none" };
  }
  if (status === "shadow") {
    if (consecutiveSuccesses(outcomes) >= SHADOW_STREAK) {
      return { action: "promote", to: "active" };
    }
    return { action: "none" };
  }
  if (status === "active") {
    const rate = failRate(outcomes, ACTIVE_WINDOW);
    if (rate !== null && rate > ACTIVE_FAIL_RATE) {
      return { action: "degrade" };
    }
    return { action: "none" };
  }
  if (status === "degraded") {
    return hasPriorActive ? { action: "rollback" } : { action: "none" };
  }
  return { action: "none" };
}
