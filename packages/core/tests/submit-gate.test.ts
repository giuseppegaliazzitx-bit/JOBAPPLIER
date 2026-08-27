import { describe, expect, it } from "vitest";
import { evaluateSubmitGate, submitGateFromHistory, type SubmitGate, type WalkHistoryItem } from "../src/index.ts";

function gate(overrides: Partial<SubmitGate> = {}): SubmitGate {
  return {
    requiredResolved: true,
    readBackOk: true,
    noInlineErrors: true,
    chipsVerified: true,
    pageKind: "review",
    ...overrides,
  };
}

function historyItem(ok = true): WalkHistoryItem {
  return {
    labelRaw: "First Name",
    fingerprint: "fn",
    resolution: {
      fingerprint: "fn",
      labelRaw: "First Name",
      type: "text",
      status: "resolved",
      value: "Ada",
      source: "test",
      confidence: 1,
      tier: 0,
    },
    fill: {
      fingerprint: "fn",
      labelRaw: "First Name",
      attempted: "Ada",
      readBack: "Ada",
      ok,
      error: ok ? null : "read-back failed",
    },
  };
}

describe("evaluateSubmitGate", () => {
  it("allows a user-approved review page that passed every check", () => {
    expect(evaluateSubmitGate(gate({ userApproved: true }))).toEqual({ ok: true });
  });

  it("allows autopilot only when the recipe is active and both toggles are on", () => {
    expect(
      evaluateSubmitGate(
        gate({ recipeActive: true, recipeAutopilot: true, siteAutopilot: true }),
      ),
    ).toEqual({ ok: true });
    expect(evaluateSubmitGate(gate({ recipeActive: true, recipeAutopilot: true }))).toEqual({
      ok: false,
      reason: "autopilot is off for this recipe or site, and the user has not approved",
    });
    expect(evaluateSubmitGate(gate({ recipeAutopilot: true, siteAutopilot: true }))).toEqual({
      ok: false,
      reason: "autopilot is off for this recipe or site, and the user has not approved",
    });
    expect(evaluateSubmitGate(gate({ recipeActive: true, siteAutopilot: true }))).toEqual({
      ok: false,
      reason: "autopilot is off for this recipe or site, and the user has not approved",
    });
  });

  it("refuses captcha, 2FA, confirmation, unresolved fields, and failed read-back", () => {
    expect(evaluateSubmitGate(gate({ userApproved: true, pageKind: "captcha" })).ok).toBe(false);
    expect(evaluateSubmitGate(gate({ userApproved: true, pageKind: "2fa" })).ok).toBe(false);
    expect(evaluateSubmitGate(gate({ userApproved: true, pageKind: "two_factor" })).ok).toBe(false);
    expect(evaluateSubmitGate(gate({ userApproved: true, pageKind: "confirmation" })).ok).toBe(false);
    expect(evaluateSubmitGate(gate({ userApproved: true, requiredResolved: false })).ok).toBe(false);
    expect(evaluateSubmitGate(gate({ userApproved: true, readBackOk: false })).ok).toBe(false);
    expect(evaluateSubmitGate(gate({ userApproved: true, noInlineErrors: false })).ok).toBe(false);
    expect(evaluateSubmitGate(gate({ userApproved: true, chipsVerified: false })).ok).toBe(false);
  });
});

describe("submitGateFromHistory", () => {
  it("marks a fully verified history as ready", () => {
    const built = submitGateFromHistory([historyItem()], "review", { userApproved: true });
    expect(built.requiredResolved).toBe(true);
    expect(built.readBackOk).toBe(true);
    expect(evaluateSubmitGate(built)).toEqual({ ok: true });
  });

  it("fails read-back when a fill did not verify", () => {
    const built = submitGateFromHistory([historyItem(false)], "review", { userApproved: true });
    expect(built.readBackOk).toBe(false);
    expect(evaluateSubmitGate(built).ok).toBe(false);
  });
});
