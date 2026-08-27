import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DistilledPageSchema, type DistilledPage } from "@autoapply/core";
import { describe, expect, it } from "vitest";
import {
  BudgetExceededError,
  TokenBudget,
  classifyPage,
  createAiHandle,
  draftAnswer,
  mapOption,
  repairStep,
  resolveLabels,
  writeCoverLetter,
  type AiCaller,
} from "../src/index.ts";

const page: DistilledPage = {
  title: "Application",
  fields: [{ id: "f1", type: "text", required: true, label: null, widget: "unknown" }],
  buttons: ["Continue"],
  errors: [],
};

function caller(text: string): AiCaller {
  return async () => ({ text, inTokens: 20, outTokens: 10 });
}

describe("enumerated purposes", () => {
  it("classifies, labels, maps, repairs, drafts, and writes only through DistilledPage", async () => {
    const classify = createAiHandle({ caller: caller(JSON.stringify({ class: "form_step" })) });
    expect(await classifyPage(classify, page)).toBe("form_step");

    const labels = createAiHandle({
      caller: caller(JSON.stringify({ labels: [{ id: "f1", label: "Preferred orbit" }] })),
    });
    expect(await resolveLabels(labels, page)).toEqual([{ id: "f1", label: "Preferred orbit" }]);

    const map = createAiHandle({ caller: caller(JSON.stringify({ index: 0 })) });
    expect(await mapOption(map, page, { canonical: "yes", options: ["Yes", "No"] })).toBe(0);

    const repair = createAiHandle({
      caller: caller(
        JSON.stringify({
          selector: { primary: { strategy: "css", value: "[data-orbit=LEO]" }, fallbacks: [] },
          action: "click",
        }),
      ),
    });
    const patch = await repairStep(repair, page, { fieldId: "f1", error: "unknown widget" });
    expect(patch.action).toBe("click");

    const draft = createAiHandle({
      caller: caller(JSON.stringify({ draft: "I am excited.", needsApproval: true })),
    });
    expect((await draftAnswer(draft, page, { question: "Why", profileContext: "eng", jobContext: "job" })).needsApproval).toBe(
      true,
    );

    const letter = createAiHandle({ caller: caller(JSON.stringify({ letter: "Dear hiring manager" })) });
    expect(await writeCoverLetter(letter, page, { jobDescription: "eng", resumeVariant: "default" })).toMatch(/Dear/);

    expect(() => DistilledPageSchema.parse("<html><form></form></html>")).toThrow();
    await expect(classifyPage(classify, "<html/>" as unknown as DistilledPage)).rejects.toThrow();
  });

  it("caches by purpose and input hash and pauses when the run ceiling is exceeded", async () => {
    let calls = 0;
    const handle = createAiHandle({
      caller: async () => {
        calls += 1;
        return { text: JSON.stringify({ class: "review" }), inTokens: 20, outTokens: 10 };
      },
    });
    expect(await classifyPage(handle, page)).toBe("review");
    expect(await classifyPage(handle, page)).toBe("review");
    expect(calls).toBe(1);

    const tight = createAiHandle({
      caller: caller(JSON.stringify({ class: "form_step" })),
      budget: new TokenBudget(5, 2),
    });
    await expect(classifyPage(tight, page)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("has no general-purpose model escape hatch", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../src/index.ts"), "utf8");
    expect(src).not.toMatch(/export \{[^}]*invokePurpose/);
    expect(src).not.toMatch(/export async function complete/);
    expect(src).not.toMatch(/export async function chat/);
  });
});
