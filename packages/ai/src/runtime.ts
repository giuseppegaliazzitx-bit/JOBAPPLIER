import {
  DistilledPageSchema,
  PURPOSE_TIER,
  hashDistilledInput,
  renderDistilledPage,
  type AiCallLog,
  type AiPurpose,
  type DistilledPage,
} from "@autoapply/core";
import type { z } from "zod";
import { TokenBudget, costUsd } from "./budget.ts";
import { PURPOSE_PROMPTS, TIER_MODELS } from "./prompts.ts";

export type AiCaller = (request: {
  purpose: AiPurpose;
  model: string;
  system: string;
  user: string;
}) => Promise<{ text: string; inTokens: number; outTokens: number }>;

export type AiCache = {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
};

export type AiHandle = {
  caller: AiCaller;
  cache: AiCache;
  budget: TokenBudget;
  onCall?: (log: AiCallLog) => void;
  runId?: string;
};

export function memoryCache(): AiCache {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
  };
}

export function createAiHandle(options: {
  caller: AiCaller;
  cache?: AiCache;
  budget?: TokenBudget;
  onCall?: (log: AiCallLog) => void;
  runId?: string;
}): AiHandle {
  return {
    caller: options.caller,
    cache: options.cache ?? memoryCache(),
    budget: options.budget ?? new TokenBudget(50_000, 2),
    onCall: options.onCall,
    runId: options.runId,
  };
}

export function requirePage(page: DistilledPage): DistilledPage {
  return DistilledPageSchema.parse(page);
}

export async function invokePurpose<T>(
  handle: AiHandle,
  purpose: AiPurpose,
  page: DistilledPage,
  schema: z.ZodType<T>,
  extraUser = "",
): Promise<T> {
  const safe = requirePage(page);
  const user = `${renderDistilledPage(safe)}${extraUser ? `\n${extraUser}` : ""}`;
  const hash = hashDistilledInput(purpose, safe, extraUser);
  const cached = handle.cache.get(hash);
  const model = TIER_MODELS[PURPOSE_TIER[purpose]];
  if (cached !== undefined) {
    const parsed = schema.parse(JSON.parse(cached));
    handle.onCall?.({
      purpose,
      model,
      inTokens: 0,
      outTokens: 0,
      costUsd: 0,
      cacheHit: true,
      runId: handle.runId,
    });
    return parsed;
  }
  const result = await handle.caller({
    purpose,
    model,
    system: PURPOSE_PROMPTS[purpose],
    user,
  });
  const tokens = result.inTokens + result.outTokens;
  const usd = costUsd(PURPOSE_TIER[purpose], result.inTokens, result.outTokens);
  handle.budget.add(tokens, usd);
  const parsed = schema.parse(JSON.parse(result.text));
  handle.cache.set(hash, result.text);
  handle.onCall?.({
    purpose,
    model,
    inTokens: result.inTokens,
    outTokens: result.outTokens,
    costUsd: usd,
    cacheHit: false,
    runId: handle.runId,
  });
  return parsed;
}
