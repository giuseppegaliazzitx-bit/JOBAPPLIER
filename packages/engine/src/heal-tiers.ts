import {
  normalizeLabel,
  selectorKey,
  type FieldDescriptor,
  type FieldInventory,
  type FillResult,
  type HealAttempt,
  type HealReport,
  type SelectorSpec,
} from "@autoapply/core";
import type { Page } from "playwright";
import { fillField } from "./fill.ts";
import { extractFieldInventory } from "./inventory.ts";
import { locatorFromSelector } from "./locate.ts";
import { nearbyError, readBack, valuesMatch } from "./verify.ts";

export const TIER2_WAIT_MS = 1500;

async function tryFill(
  page: Page,
  field: FieldDescriptor,
  selector: SelectorSpec,
  attempted: string,
): Promise<FillResult> {
  if (field.widget === "unknown") {
    throw new Error(`unknown widget for ${field.labelRaw}`);
  }
  const patched = { ...field, selector };
  const outcome = await fillField(page, patched, attempted);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const actual = (await readBack(page, patched)) ?? outcome.readBack;
  const error = await nearbyError(page, patched);
  const ok = valuesMatch(attempted, actual) && !error;
  return {
    fingerprint: field.fingerprint,
    labelRaw: field.labelRaw,
    attempted,
    readBack: actual,
    ok,
    error,
    chipVerified: outcome.chipVerified,
  };
}

async function countSelector(page: Page, spec: SelectorSpec["primary"]): Promise<number> {
  return locatorFromSelector(page, spec).count();
}

export async function escalateHeal(options: {
  page: Page;
  field: FieldDescriptor;
  inventory: FieldInventory;
  attempted: string;
  error: string;
  heal?: (info: {
    field: FieldDescriptor;
    inventory: FieldInventory;
    attempted: string;
    error: string;
  }) => Promise<FillResult | null>;
  tier2WaitMs?: number;
}): Promise<{ report: HealReport; fill: FillResult | null }> {
  const attempts: HealAttempt[] = [];
  const originalSelector = options.field.selector;
  const page = options.page;
  const field = options.field;
  const attempted = options.attempted;

  const succeed = (tier: HealReport["winningTier"], fill: FillResult, working: SelectorSpec) => {
    const report: HealReport = {
      fingerprint: field.fingerprint,
      labelRaw: field.labelRaw,
      attempts,
      paused: false,
      winningTier: tier,
      originalSelector,
      workingSelector: working,
    };
    return { report, fill };
  };

  if (field.widget !== "unknown") {
    const chain = [originalSelector.primary, ...originalSelector.fallbacks];
    for (const selector of chain) {
      const n = await countSelector(page, selector);
      const okCount = n === 1;
      attempts.push({
        tier: 0,
        tried: selectorKey(selector),
        ok: okCount,
        detail: okCount ? "unique" : `count=${n}`,
      });
      if (!okCount) {
        continue;
      }
      try {
        const fill = await tryFill(page, field, { primary: selector, fallbacks: [] }, attempted);
        if (fill.ok) {
          const lastAttempt = attempts[attempts.length - 1];
          if (lastAttempt) {
            lastAttempt.ok = true;
            lastAttempt.detail = "filled";
          }
          return succeed(0, fill, { primary: selector, fallbacks: [] });
        }
      } catch (error) {
        attempts[attempts.length - 1] = {
          tier: 0,
          tried: selectorKey(selector),
          ok: false,
          detail: error instanceof Error ? error.message : "fill failed",
        };
      }
    }

    const liveInventory = await extractFieldInventory(page);
    const live = liveInventory.fields.find(
      (item) => item.labelNorm === field.labelNorm || item.fingerprint === field.fingerprint,
    );
    if (live) {
      attempts.push({ tier: 1, tried: `labelNorm=${field.labelNorm}`, ok: false });
      try {
        const fill = await tryFill(page, field, live.selector, attempted);
        attempts[attempts.length - 1] = {
          tier: 1,
          tried: `labelNorm=${field.labelNorm} ${selectorKey(live.selector.primary)}`,
          ok: fill.ok,
        };
        if (fill.ok) {
          return succeed(1, fill, live.selector);
        }
      } catch (error) {
        attempts[attempts.length - 1] = {
          tier: 1,
          tried: `labelNorm=${field.labelNorm}`,
          ok: false,
          detail: error instanceof Error ? error.message : "tier 1 failed",
        };
      }
    } else {
      attempts.push({ tier: 1, tried: `labelNorm=${field.labelNorm}`, ok: false, detail: "not in inventory" });
    }

    const waitMs = options.tier2WaitMs ?? TIER2_WAIT_MS;
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const refreshed = await extractFieldInventory(page);
    const later = refreshed.fields.find(
      (item) => item.labelNorm === field.labelNorm || normalizeLabel(item.labelRaw) === field.labelNorm,
    );
    attempts.push({
      tier: 2,
      tried: "re-inventory after idle",
      ok: Boolean(later),
    });
    if (later) {
      try {
        const fill = await tryFill(page, field, later.selector, attempted);
        attempts[attempts.length - 1] = {
          tier: 2,
          tried: `re-inventory ${selectorKey(later.selector.primary)}`,
          ok: fill.ok,
        };
        if (fill.ok) {
          return succeed(2, fill, later.selector);
        }
      } catch (error) {
        attempts[attempts.length - 1] = {
          tier: 2,
          tried: "re-inventory after idle",
          ok: false,
          detail: error instanceof Error ? error.message : "tier 2 failed",
        };
      }
    }
  } else {
    attempts.push({ tier: 0, tried: "unknown widget skips native locate", ok: false });
    attempts.push({ tier: 1, tried: "unknown widget skips re-derive", ok: false });
    attempts.push({ tier: 2, tried: "unknown widget skips wait", ok: false });
  }

  if (options.heal) {
    attempts.push({ tier: 3, tried: "repair_step", ok: false });
    try {
      const healed = await options.heal({
        field,
        inventory: options.inventory,
        attempted,
        error: options.error,
      });
      const ok = Boolean(healed?.ok);
      attempts[attempts.length - 1] = { tier: 3, tried: "repair_step", ok, detail: healed?.error ?? undefined };
      if (healed?.ok) {
        const working = healed.workingSelector ?? originalSelector;
        return succeed(3, healed, working);
      }
    } catch (error) {
      attempts[attempts.length - 1] = {
        tier: 3,
        tried: "repair_step",
        ok: false,
        detail: error instanceof Error ? error.message : "ai heal failed",
      };
    }
  } else {
    attempts.push({ tier: 3, tried: "repair_step skipped (no AI)", ok: false });
  }

  attempts.push({
    tier: 4,
    tried: "pause to blocked queue",
    ok: false,
    detail: "heal exhausted",
  });
  return {
    report: {
      fingerprint: field.fingerprint,
      labelRaw: field.labelRaw,
      attempts,
      paused: true,
      winningTier: 4,
      originalSelector,
    },
    fill: null,
  };
}
