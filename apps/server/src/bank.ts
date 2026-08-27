import { randomUUID } from "node:crypto";
import {
  FieldOptionSchema,
  FieldTypeSchema,
  QuestionCardSchema,
  WidgetKindSchema,
  optionsHash,
  type FieldInventory,
  type ProfileValues,
  type QuestionCard,
  type StoredAnswer,
} from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import { z } from "zod";

const QuestionRow = z.object({
  id: z.string(),
  fingerprint: z.string(),
  label_norm: z.string(),
  label_raw_examples_json: z.string(),
  type: z.string(),
  options_hash: z.string().nullable(),
  occurrences: z.number(),
  widget: z.string(),
  required: z.union([z.number(), z.boolean()]),
  options_json: z.string().nullable(),
  section_heading: z.string().nullable(),
  label_raw: z.string(),
  blocked_json: z.string(),
});

const AnswerJoin = z.object({
  fingerprint: z.string(),
  label_raw: z.string(),
  label_norm: z.string(),
  type: z.string(),
  options_json: z.string().nullable(),
  canonical_value: z.string(),
  alias_norm: z.string().nullable(),
});

export type Blocker = { jobId?: string; title: string; url?: string };

export function importInventory(
  sqlite: SqliteDatabase,
  inventory: FieldInventory,
  blocker?: Blocker,
): string[] {
  const ids: string[] = [];
  const now = new Date().toISOString();
  for (const field of inventory.fields) {
    const existing = sqlite
      .prepare(`SELECT * FROM questions WHERE fingerprint = ?`)
      .get(field.fingerprint);
    if (existing) {
      const row = QuestionRow.parse(existing);
      const examples = z.array(z.string()).parse(JSON.parse(row.label_raw_examples_json));
      if (!examples.includes(field.labelRaw)) {
        examples.push(field.labelRaw);
      }
      const blocked = z.array(z.object({ jobId: z.string().optional(), title: z.string(), url: z.string().optional() })).parse(
        JSON.parse(row.blocked_json),
      );
      if (blocker && !blocked.some((item) => item.title === blocker.title && item.url === blocker.url)) {
        blocked.push(blocker);
      }
      sqlite
        .prepare(
          `UPDATE questions SET occurrences = occurrences + 1, last_seen = ?, label_raw_examples_json = ?, blocked_json = ? WHERE id = ?`,
        )
        .run(now, JSON.stringify(examples), JSON.stringify(blocked), row.id);
      ids.push(row.id);
      continue;
    }
    const id = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO questions (
           id, fingerprint, label_norm, label_raw_examples_json, type, options_hash,
           occurrences, first_seen, last_seen, widget, required, options_json,
           section_heading, label_raw, blocked_json
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        field.fingerprint,
        field.labelNorm,
        JSON.stringify([field.labelRaw]),
        field.type,
        optionsHash(field.options) || null,
        now,
        now,
        field.widget,
        field.required ? 1 : 0,
        field.options ? JSON.stringify(field.options) : null,
        field.sectionHeading ?? null,
        field.labelRaw,
        JSON.stringify(blocker ? [blocker] : []),
      );
    ids.push(id);
  }
  return ids;
}

export function loadBank(sqlite: SqliteDatabase): StoredAnswer[] {
  const rows = sqlite
    .prepare(
      `SELECT q.fingerprint, q.label_raw, q.label_norm, q.type, q.options_json, a.canonical_value, al.alias_norm
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       LEFT JOIN question_aliases al ON al.question_id = q.id`,
    )
    .all();
  const byFp = new Map<string, StoredAnswer>();
  for (const raw of rows) {
    const row = AnswerJoin.parse(raw);
    const current = byFp.get(row.fingerprint);
    const options = row.options_json
      ? z.array(FieldOptionSchema).parse(JSON.parse(row.options_json))
      : undefined;
    if (current) {
      if (row.alias_norm && !current.aliases.includes(row.alias_norm)) {
        current.aliases.push(row.alias_norm);
      }
      continue;
    }
    byFp.set(row.fingerprint, {
      fingerprint: row.fingerprint,
      labelRaw: row.label_raw,
      labelNorm: row.label_norm,
      type: FieldTypeSchema.parse(row.type),
      options,
      canonicalValue: row.canonical_value,
      aliases: row.alias_norm ? [row.alias_norm] : [],
    });
  }
  return [...byFp.values()];
}

export function saveAnswer(
  sqlite: SqliteDatabase,
  questionId: string,
  canonicalValue: string,
  scope: "global" | "company" | "job",
  extras?: { companyId?: string; jobId?: string; chosenOption?: string },
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(`DELETE FROM answers WHERE question_id = ? AND scope = ?`)
    .run(questionId, scope);
  sqlite
    .prepare(
      `INSERT INTO answers (id, question_id, scope, company_id, job_id, canonical_value, source, confidence, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, 'user', 1, ?)`,
    )
    .run(
      randomUUID(),
      questionId,
      scope,
      extras?.companyId ?? null,
      extras?.jobId ?? null,
      canonicalValue,
      now,
    );
  const q = sqlite.prepare(`SELECT fingerprint, label_norm, options_hash FROM questions WHERE id = ?`).get(questionId);
  const parsed = z
    .object({ fingerprint: z.string(), label_norm: z.string(), options_hash: z.string().nullable() })
    .parse(q);
  sqlite
    .prepare(
      `INSERT INTO question_aliases (id, question_id, alias_norm, source) VALUES (?, ?, ?, 'user')`,
    )
    .run(randomUUID(), questionId, parsed.label_norm);
  if (extras?.chosenOption && parsed.options_hash) {
    sqlite
      .prepare(
        `INSERT INTO option_mappings (id, question_id, options_hash, canonical_value, chosen_option)
         VALUES (?, ?, ?, ?, ?)`,
      )
    .run(randomUUID(), questionId, parsed.options_hash, canonicalValue, extras.chosenOption);
  }
}

export function listQuestionCards(sqlite: SqliteDatabase, profile?: ProfileValues): QuestionCard[] {
  const rows = sqlite.prepare(`SELECT * FROM questions ORDER BY occurrences DESC, last_seen DESC`).all();
  const answers = sqlite
    .prepare(`SELECT question_id, canonical_value, scope FROM answers`)
    .all();
  const answerByQ = new Map<string, { canonicalValue: string; scope: "global" | "company" | "job" }>();
  for (const raw of answers) {
    const parsed = z
      .object({
        question_id: z.string(),
        canonical_value: z.string(),
        scope: z.enum(["global", "company", "job"]),
      })
      .parse(raw);
    answerByQ.set(parsed.question_id, { canonicalValue: parsed.canonical_value, scope: parsed.scope });
  }
  void profile;
  return rows.map((raw) => {
    const row = QuestionRow.parse(raw);
    const options = row.options_json
      ? z.array(FieldOptionSchema).parse(JSON.parse(row.options_json))
      : undefined;
    const blocked = z
      .array(z.object({ jobId: z.string().optional(), title: z.string(), url: z.string().optional() }))
      .parse(JSON.parse(row.blocked_json));
    const answer = answerByQ.get(row.id) ?? null;
    return QuestionCardSchema.parse({
      id: row.id,
      fingerprint: row.fingerprint,
      labelRaw: row.label_raw,
      labelNorm: row.label_norm,
      type: row.type,
      widget: WidgetKindSchema.parse(row.widget),
      required: Boolean(row.required),
      options,
      sectionHeading: row.section_heading ?? undefined,
      occurrences: row.occurrences,
      blocked,
      answer,
    });
  });
}

export function loadOptionAliases(sqlite: SqliteDatabase) {
  const rows = sqlite
    .prepare(`SELECT options_hash, canonical_value, chosen_option FROM option_mappings`)
    .all();
  return rows.map((raw) =>
    z
      .object({
        options_hash: z.string(),
        canonical_value: z.string(),
        chosen_option: z.string(),
      })
      .parse(raw),
  ).map((row) => ({
    optionsHash: row.options_hash,
    canonicalValue: row.canonical_value,
    chosenOption: row.chosen_option,
  }));
}


