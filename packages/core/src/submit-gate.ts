import type { WalkHistoryItem } from "./run.ts";

export type SubmitGate = {
  userApproved?: boolean;
  recipeActive?: boolean;
  recipeAutopilot?: boolean;
  siteAutopilot?: boolean;
  requiredResolved: boolean;
  readBackOk: boolean;
  noInlineErrors: boolean;
  chipsVerified: boolean;
  pageKind: string;
};

export type SubmitVerdict = { ok: true } | { ok: false; reason: string };

const BLOCKED_KINDS = new Set(["error", "timeout", "captcha", "expired", "2fa", "two_factor", "email_otp"]);

export function evaluateSubmitGate(gate: SubmitGate): SubmitVerdict {
  if (BLOCKED_KINDS.has(gate.pageKind)) {
    return { ok: false, reason: `page is ${gate.pageKind}` };
  }
  if (gate.pageKind !== "review" && gate.pageKind !== "form") {
    return { ok: false, reason: `page is ${gate.pageKind}` };
  }
  if (!gate.requiredResolved) {
    return { ok: false, reason: "required fields are not resolved" };
  }
  if (!gate.readBackOk) {
    return { ok: false, reason: "read-back failed" };
  }
  if (!gate.noInlineErrors) {
    return { ok: false, reason: "inline validation errors" };
  }
  if (!gate.chipsVerified) {
    return { ok: false, reason: "typeahead chip not verified" };
  }
  if (gate.userApproved === true) {
    return { ok: true };
  }
  if (gate.recipeActive && gate.recipeAutopilot && gate.siteAutopilot) {
    return { ok: true };
  }
  return { ok: false, reason: "autopilot is off for this recipe or site, and the user has not approved" };
}

export function submitGateFromHistory(
  history: WalkHistoryItem[],
  pageKind: string,
  flags: {
    userApproved?: boolean;
    recipeActive?: boolean;
    recipeAutopilot?: boolean;
    siteAutopilot?: boolean;
  },
): SubmitGate {
  const fills = history.map((item) => item.fill);
  return {
    userApproved: flags.userApproved,
    recipeActive: flags.recipeActive,
    recipeAutopilot: flags.recipeAutopilot,
    siteAutopilot: flags.siteAutopilot,
    requiredResolved:
      fills.length === 0
        ? pageKind === "review"
        : history.every((item) => item.resolution.status === "resolved"),
    readBackOk: fills.every((item) => item.ok),
    noInlineErrors: fills.every((item) => !item.error),
    chipsVerified: fills.every((item) => item.chipVerified !== false),
    pageKind,
  };
}
