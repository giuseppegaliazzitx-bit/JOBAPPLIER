import { z } from "zod";
import { FieldTypeSchema, type FieldDescriptor, type FieldInventory } from "./field.ts";
import { MatchTierSchema } from "./answer.ts";
import { fieldFingerprint, optionsHash } from "./fingerprint.ts";
import { matchField, type EmbedFn, type StoredAnswer } from "./match.ts";
import { PROFILE_CLUSTERS, clusterFor, defaultTypeForCluster } from "./aliases.ts";
import { normalizeQuestion } from "./question-normalize.ts";
import type { ProfileValues } from "./profile.ts";

export const ResolutionSchema = z.object({
  fingerprint: z.string(),
  labelRaw: z.string(),
  type: FieldTypeSchema,
  status: z.enum(["resolved", "suggested", "unanswered"]),
  value: z.string().optional(),
  source: z.string().optional(),
  confidence: z.number(),
  tier: MatchTierSchema,
  matchedLabel: z.string().optional(),
  similarity: z.number().optional(),
});

export type Resolution = z.infer<typeof ResolutionSchema>;

export function answersFromProfile(profile: ProfileValues): StoredAnswer[] {
  const out: StoredAnswer[] = [];
  for (const [key, cluster] of Object.entries(PROFILE_CLUSTERS)) {
    const value = profile[key as keyof ProfileValues];
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    const type = defaultTypeForCluster(cluster);
    const labelRaw = cluster.replace(/_/g, " ");
    const labelNorm = normalizeQuestion(labelRaw);
    out.push({
      fingerprint: fieldFingerprint(labelNorm, type, undefined),
      labelRaw,
      labelNorm,
      type,
      canonicalValue: value,
      aliases: [],
    });
  }
  return out;
}

function confidenceForTier(tier: 0 | 1 | 2 | 3 | 4): number {
  if (tier === 0) return 1;
  if (tier === 1) return 0.99;
  if (tier === 2) return 0.94;
  if (tier === 3) return 0.85;
  return 0;
}

export async function resolveInventory(
  inventory: FieldInventory,
  bank: StoredAnswer[],
  options?: {
    embed?: EmbedFn;
    company?: string;
    profile?: ProfileValues;
    optionAliases?: Array<{ optionsHash: string; canonicalValue: string; chosenOption: string }>;
  },
): Promise<Resolution[]> {
  const combined = [...(options?.profile ? answersFromProfile(options.profile) : []), ...bank];
  const resolutions: Resolution[] = [];
  for (const field of inventory.fields) {
    const decision = await matchField(
      {
        fingerprint: field.fingerprint,
        labelRaw: field.labelRaw,
        labelNorm: field.labelNorm,
        type: field.type,
        options: field.options,
      },
      combined,
      {
        embed: options?.embed,
        company: options?.company,
        optionAliases: options?.optionAliases,
        optionsHash: optionsHash(field.options),
      },
    );
    if (decision.fill && decision.mappedValue !== undefined) {
      resolutions.push(
        ResolutionSchema.parse({
          fingerprint: field.fingerprint,
          labelRaw: field.labelRaw,
          type: field.type,
          status: "resolved",
          value: decision.mappedValue,
          source: decision.source,
          confidence: confidenceForTier(decision.tier),
          tier: decision.tier,
          matchedLabel: decision.matchedLabel,
          similarity: decision.similarity,
        }),
      );
      continue;
    }
    if (decision.tier === 3 && decision.canonicalValue !== undefined) {
      resolutions.push(
        ResolutionSchema.parse({
          fingerprint: field.fingerprint,
          labelRaw: field.labelRaw,
          type: field.type,
          status: "suggested",
          value: decision.mappedValue ?? decision.canonicalValue,
          source: decision.source,
          confidence: confidenceForTier(3),
          tier: 3,
          matchedLabel: decision.matchedLabel,
          similarity: decision.similarity,
        }),
      );
      continue;
    }
    resolutions.push(
      ResolutionSchema.parse({
        fingerprint: field.fingerprint,
        labelRaw: field.labelRaw,
        type: field.type,
        status: "unanswered",
        confidence: 0,
        tier: 4,
      }),
    );
  }
  return resolutions;
}

export function questionCanBeAnsweredByProfile(
  field: Pick<FieldDescriptor, "labelRaw" | "type">,
  profile: ProfileValues,
): boolean {
  const cluster = clusterFor(field.labelRaw);
  if (!cluster) {
    return false;
  }
  for (const [key, mapped] of Object.entries(PROFILE_CLUSTERS)) {
    if (mapped !== cluster) {
      continue;
    }
    const value = profile[key as keyof ProfileValues];
    return typeof value === "string" && value.length > 0;
  }
  return false;
}
