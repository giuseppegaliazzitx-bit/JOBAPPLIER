import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fieldFingerprint } from "../src/fingerprint.ts";
import { buildMatchingCorpus } from "../src/matching-corpus.ts";
import { matchField, type StoredAnswer } from "../src/match.ts";
import { normalizeQuestion } from "../src/question-normalize.ts";

const here = dirname(fileURLToPath(import.meta.url));

function asStored(label: string, type: StoredAnswer["type"]): StoredAnswer {
  const labelNorm = normalizeQuestion(label);
  return {
    fingerprint: fieldFingerprint(labelNorm, type, undefined),
    labelRaw: label,
    labelNorm,
    type,
    canonicalValue: "canonical",
    aliases: [],
  };
}

describe("matching corpus", () => {
  const corpus = buildMatchingCorpus();

  it("has at least 150 should-match and 150 should-not-match pairs", () => {
    expect(corpus.shouldMatch.length).toBeGreaterThanOrEqual(150);
    expect(corpus.shouldNotMatch.length).toBeGreaterThanOrEqual(150);
    writeFileSync(
      join(here, "../../../fixtures/matching.json"),
      `${JSON.stringify(corpus, null, 2)}\n`,
      "utf8",
    );
  });

  it("matches should-match pairs at ≥0.95 precision and never auto-fills should-not-match", async () => {
    let hits = 0;
    for (const pair of corpus.shouldMatch) {
      const decision = await matchField(
        {
          fingerprint: "live",
          labelRaw: pair.b.label,
          labelNorm: normalizeQuestion(pair.b.label),
          type: pair.b.type,
        },
        [asStored(pair.a.label, pair.a.type)],
      );
      if (decision.fill && (decision.tier === 0 || decision.tier === 1 || decision.tier === 2)) {
        hits += 1;
      }
    }
    const precision = hits / corpus.shouldMatch.length;
    expect(precision).toBeGreaterThanOrEqual(0.95);

    let falsePositives = 0;
    const offenders: string[] = [];
    for (const pair of corpus.shouldNotMatch) {
      const decision = await matchField(
        {
          fingerprint: "live",
          labelRaw: pair.b.label,
          labelNorm: normalizeQuestion(pair.b.label),
          type: pair.b.type,
        },
        [asStored(pair.a.label, pair.a.type)],
      );
      if (decision.fill) {
        falsePositives += 1;
        offenders.push(`${pair.a.label} => ${pair.b.label} (tier ${decision.tier})`);
      }
    }
    expect(falsePositives, offenders.join("\n")).toBe(0);
  });
});
