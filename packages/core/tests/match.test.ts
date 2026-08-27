import { describe, expect, it } from "vitest";
import { fieldFingerprint } from "../src/fingerprint.ts";
import { matchField, type StoredAnswer } from "../src/match.ts";
import { normalizeQuestion } from "../src/question-normalize.ts";
import { resolveInventory } from "../src/resolution.ts";
import { typesCompatible } from "../src/type-compat.ts";

function stored(label: string, type: StoredAnswer["type"], value: string): StoredAnswer {
  const labelNorm = normalizeQuestion(label);
  return {
    fingerprint: fieldFingerprint(labelNorm, type, undefined),
    labelRaw: label,
    labelNorm,
    type,
    canonicalValue: value,
    aliases: [],
  };
}

describe("matchField", () => {
  it("fills on fingerprint and alias, never across type mismatch", async () => {
    const auth = stored("Are you authorized to work in the US?", "select", "yes");
    const fp = await matchField(
      { ...auth, labelRaw: auth.labelRaw, labelNorm: auth.labelNorm },
      [auth],
    );
    expect(fp.tier).toBe(0);
    expect(fp.fill).toBe(true);

    const alias = await matchField(
      {
        fingerprint: "other",
        labelRaw: "Do you have US work authorization?",
        labelNorm: normalizeQuestion("Do you have US work authorization?"),
        type: "radio",
      },
      [auth],
    );
    expect(alias.tier).toBe(1);
    expect(alias.fill).toBe(true);

    expect(typesCompatible("text", "select")).toBe(false);
    const textVsSelect = await matchField(
      {
        fingerprint: "x",
        labelRaw: "Notes",
        labelNorm: "notes",
        type: "select",
        options: [{ value: "a", label: "A" }],
      },
      [stored("Notes", "text", "hello")],
    );
    expect(textVsSelect.fill).toBe(false);
  });

  it("does not auto-fill work authorization from a sponsorship answer", async () => {
    const decision = await matchField(
      {
        fingerprint: "live",
        labelRaw: "Are you authorized to work in the US?",
        labelNorm: normalizeQuestion("Are you authorized to work in the US?"),
        type: "select",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      },
      [stored("Will you now or in the future require sponsorship?", "select", "no")],
    );
    expect(decision.fill).toBe(false);
    expect(decision.tier).toBe(4);
  });
});

describe("resolveInventory dry-run", () => {
  it("returns unresolved fields without inventing a value", async () => {
    const resolutions = await resolveInventory(
      {
        title: "t",
        fields: [
          {
            fingerprint: "abc",
            labelRaw: "Why Acme?",
            labelNorm: "why acme",
            labelSource: "label_for",
            type: "textarea",
            widget: "native",
            required: true,
            selector: { primary: { strategy: "label", value: "Why Acme?" }, fallbacks: [] },
            containerPath: "form",
            visible: true,
            disabled: false,
          },
        ],
      },
      [],
    );
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]?.status).toBe("unanswered");
    expect(resolutions[0]?.value).toBeUndefined();
  });
});
