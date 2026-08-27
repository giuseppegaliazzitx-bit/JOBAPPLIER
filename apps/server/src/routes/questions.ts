import {
  AnswerScopeSchema,
  FieldInventorySchema,
  questionCanBeAnsweredByProfile,
  resolveInventory,
  type EmbedFn,
  type ProfileValues,
} from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { profileValuesFromStore } from "@autoapply/core";
import { importInventory, listQuestionCards, loadBank, loadOptionAliases, saveAnswer } from "../bank.ts";

const ProfileRow = z.object({ key: z.string(), value: z.string() });

function loadProfile(sqlite: SqliteDatabase): ProfileValues {
  const rows = sqlite.prepare(`SELECT key, value FROM profile`).all().map((row) => ProfileRow.parse(row));
  return profileValuesFromStore(rows);
}

export function registerQuestionRoutes(
  app: FastifyInstance,
  sqlite: SqliteDatabase,
  embed?: EmbedFn,
): void {
  app.get("/api/questions", async () => {
    const profile = loadProfile(sqlite);
    const cards = listQuestionCards(sqlite, profile);
    const bank = loadBank(sqlite);
    const optionAliases = loadOptionAliases(sqlite);
    const inventory = {
      title: "queue",
      fields: cards.map((card) => ({
        fingerprint: card.fingerprint,
        labelRaw: card.labelRaw,
        labelNorm: card.labelNorm,
        labelSource: "label_for" as const,
        type: card.type,
        widget: card.widget,
        required: card.required,
        options: card.options,
        selector: { primary: { strategy: "label" as const, value: card.labelRaw || card.fingerprint }, fallbacks: [] },
        containerPath: "questions",
        visible: true,
        disabled: false,
        sectionHeading: card.sectionHeading,
      })),
    };
    const resolutions = await resolveInventory(inventory, bank, {
      embed,
      profile,
      optionAliases,
    });
    const byFp = new Map(resolutions.map((item) => [item.fingerprint, item]));
    const withSuggestions = cards.map((card) => {
      const resolution = byFp.get(card.fingerprint);
      if (resolution?.status === "suggested" && resolution.value && resolution.matchedLabel) {
        return {
          ...card,
          suggestion: {
            value: resolution.value,
            matchedLabel: resolution.matchedLabel,
            similarity: resolution.similarity ?? 0,
          },
        };
      }
      return card;
    });
    return { questions: withSuggestions };
  });

  app.post("/api/questions/import", async (request, reply) => {
    const body = z
      .object({
        inventory: FieldInventorySchema,
        jobTitle: z.string().optional(),
        jobUrl: z.string().optional(),
        jobId: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    const blocker = body.data.jobTitle
      ? { jobId: body.data.jobId, title: body.data.jobTitle, url: body.data.jobUrl }
      : undefined;
    importInventory(sqlite, body.data.inventory, blocker);
    return { questions: listQuestionCards(sqlite, loadProfile(sqlite)) };
  });

  app.post("/api/questions/:id/answer", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        canonicalValue: z.string().min(1),
        scope: AnswerScopeSchema,
        companyId: z.string().optional(),
        jobId: z.string().optional(),
        chosenOption: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    const exists = sqlite.prepare(`SELECT id FROM questions WHERE id = ?`).get(params.id);
    if (!exists) {
      return reply.code(404).send({ error: "not found" });
    }
    saveAnswer(sqlite, params.id, body.data.canonicalValue, body.data.scope, {
      companyId: body.data.companyId,
      jobId: body.data.jobId,
      chosenOption: body.data.chosenOption,
    });
    return { questions: listQuestionCards(sqlite, loadProfile(sqlite)) };
  });

  app.get("/api/profile/completeness", async () => {
    const profile = loadProfile(sqlite);
    const cards = listQuestionCards(sqlite, profile);
    const gaps = cards
      .filter((card) => !card.answer && !questionCanBeAnsweredByProfile(card, profile))
      .sort((a, b) => b.occurrences - a.occurrences)
      .map((card) => ({
        labelRaw: card.labelRaw,
        type: card.type,
        occurrences: card.occurrences,
      }));
    return { gaps, totalQuestions: cards.length };
  });
}

export { loadProfile };
