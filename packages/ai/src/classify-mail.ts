import {
  ClassifyMailResultSchema,
  HTML_TAG_RE,
  PURPOSE_TIER,
  hashDistilledInput,
  scrubPii,
  stripTags,
  type DistilledPage,
  type MailKind,
  type MailMessage,
} from "@autoapply/core";
import { costUsd } from "./budget.ts";
import { PURPOSE_PROMPTS, TIER_MODELS } from "./prompts.ts";
import { type AiHandle } from "./runtime.ts";

function assertNoHtml(subject: string, text: string): void {
  if (HTML_TAG_RE.test(subject) || HTML_TAG_RE.test(text)) {
    throw new Error("raw HTML is not allowed");
  }
}

export async function classifyMailWithModel(handle: AiHandle, message: MailMessage): Promise<MailKind> {
  assertNoHtml(message.subject, message.text ?? "");
  const subject = stripTags(message.subject);
  const text = stripTags(message.text ?? "");
  const user = scrubPii(`SUBJECT: ${subject}\nTEXT: ${text}`).slice(0, 4000);
  const emptyPage: DistilledPage = { title: "mail", fields: [], buttons: [], errors: [] };
  const hash = hashDistilledInput("classify_mail", emptyPage, user);
  const cached = handle.cache.get(hash);
  const model = TIER_MODELS[PURPOSE_TIER.classify_mail];
  if (cached !== undefined) {
    const parsed = ClassifyMailResultSchema.parse(JSON.parse(cached));
    handle.onCall?.({
      purpose: "classify_mail",
      model,
      inTokens: 0,
      outTokens: 0,
      costUsd: 0,
      cacheHit: true,
      runId: handle.runId,
    });
    return parsed.kind;
  }
  const result = await handle.caller({
    purpose: "classify_mail",
    model,
    system: PURPOSE_PROMPTS.classify_mail,
    user,
  });
  handle.budget.add(result.inTokens + result.outTokens, costUsd("small", result.inTokens, result.outTokens));
  const parsed = ClassifyMailResultSchema.parse(JSON.parse(result.text));
  handle.cache.set(hash, JSON.stringify(parsed));
  handle.onCall?.({
    purpose: "classify_mail",
    model,
    inTokens: result.inTokens,
    outTokens: result.outTokens,
    costUsd: costUsd("small", result.inTokens, result.outTokens),
    cacheHit: false,
    runId: handle.runId,
  });
  return parsed.kind;
}
