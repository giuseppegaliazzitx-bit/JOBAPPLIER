import type { FieldOption, FieldType } from "./field.ts";
import type { MatchTier } from "./answer.ts";
import { clusterFor } from "./aliases.ts";
import { cosine } from "./cosine.ts";
import { mapOption, type OptionEmbedFn } from "./option-map.ts";
import { polaritiesConflict, polarityTags } from "./polarity.ts";
import { normalizeQuestion } from "./question-normalize.ts";
import { typesCompatible } from "./type-compat.ts";

export type EmbedFn = (text: string) => ArrayLike<number> | Promise<ArrayLike<number>>;

export type StoredAnswer = {
  fingerprint: string;
  labelRaw: string;
  labelNorm: string;
  type: FieldType;
  options?: FieldOption[];
  canonicalValue: string;
  aliases: string[];
};

export type LiveField = {
  fingerprint: string;
  labelRaw: string;
  labelNorm: string;
  type: FieldType;
  options?: FieldOption[];
};

export type MatchDecision = {
  tier: MatchTier;
  fill: boolean;
  canonicalValue?: string;
  mappedValue?: string;
  matchedLabel?: string;
  similarity?: number;
  source: "fingerprint" | "alias" | "embedding" | "none";
};

const TIER2 = 0.92;
const TIER3_LOW = 0.78;

async function maybeEmbed(embed: EmbedFn | undefined, text: string): Promise<ArrayLike<number> | null> {
  if (!embed) {
    return null;
  }
  return embed(text);
}

export async function matchField(
  field: LiveField,
  bank: StoredAnswer[],
  options?: {
    embed?: EmbedFn;
    company?: string;
    optionAliases?: Array<{ optionsHash: string; canonicalValue: string; chosenOption: string }>;
    optionsHash?: string;
  },
): Promise<MatchDecision> {
  const liveTags = polarityTags(field.labelRaw, options?.company);
  const liveNorm = field.labelNorm || normalizeQuestion(field.labelRaw, options?.company);
  const liveCluster = clusterFor(field.labelRaw, options?.company);

  let bestSuggest: MatchDecision | null = null;

  for (const stored of bank) {
    if (!typesCompatible(stored.type, field.type)) {
      continue;
    }
    const storedTags = polarityTags(stored.labelRaw, options?.company);
    if (polaritiesConflict(liveTags, storedTags)) {
      continue;
    }

    if (stored.fingerprint === field.fingerprint) {
      return finish(field, stored, {
        tier: 0,
        fill: true,
        source: "fingerprint",
        similarity: 1,
      }, options);
    }

    const storedNorm = stored.labelNorm || normalizeQuestion(stored.labelRaw, options?.company);
    const aliasHit =
      stored.aliases.includes(liveNorm) ||
      stored.aliases.includes(field.labelRaw) ||
      liveNorm === storedNorm;
    const storedCluster = clusterFor(stored.labelRaw, options?.company);
    if (aliasHit || (liveCluster !== null && liveCluster === storedCluster)) {
      return finish(field, stored, {
        tier: 1,
        fill: true,
        source: "alias",
        similarity: 1,
      }, options);
    }

    const liveVec = await maybeEmbed(options?.embed, liveNorm);
    const storedVec = liveVec ? await maybeEmbed(options?.embed, storedNorm) : null;
    if (liveVec && storedVec) {
      const score = cosine(liveVec, storedVec);
      if (score >= TIER2) {
        return finish(field, stored, {
          tier: 2,
          fill: true,
          source: "embedding",
          similarity: score,
        }, options);
      }
      if (score >= TIER3_LOW && (!bestSuggest || (bestSuggest.similarity ?? 0) < score)) {
        const mapped = await finish(field, stored, {
          tier: 3,
          fill: false,
          source: "embedding",
          similarity: score,
        }, options);
        if (mapped.canonicalValue) {
          bestSuggest = mapped;
        }
      }
    }
  }

  if (bestSuggest) {
    return bestSuggest;
  }
  return { tier: 4, fill: false, source: "none" };
}

async function finish(
  field: LiveField,
  stored: StoredAnswer,
  base: Omit<MatchDecision, "canonicalValue" | "mappedValue" | "matchedLabel"> & {
    fill: boolean;
    source: MatchDecision["source"];
  },
  options?: {
    embed?: EmbedFn;
    optionAliases?: Array<{ optionsHash: string; canonicalValue: string; chosenOption: string }>;
    optionsHash?: string;
  },
): Promise<MatchDecision> {
  const decision: MatchDecision = {
    ...base,
    canonicalValue: stored.canonicalValue,
    matchedLabel: stored.labelRaw,
  };
  if (!field.options || field.options.length === 0) {
    decision.mappedValue = stored.canonicalValue;
    return decision;
  }
  const mapped = await mapOption(
    stored.canonicalValue,
    field.options,
    options?.embed as OptionEmbedFn | undefined,
    options?.optionAliases,
    options?.optionsHash,
  );
  if (mapped.status === "unmapped") {
    if (base.fill) {
      return { tier: 4, fill: false, source: "none" };
    }
    return { tier: 4, fill: false, source: "none" };
  }
  decision.mappedValue = mapped.option.value;
  return decision;
}
