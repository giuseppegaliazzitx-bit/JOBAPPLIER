import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const DocumentKind = z.enum(["resume", "cover_letter"]);

const DocumentRow = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  path: z.string(),
  keywords_json: z.string(),
  is_default: z.union([z.number(), z.boolean()]),
});

export type DocumentPublic = {
  id: string;
  kind: string;
  label: string;
  keywords: string[];
  isDefault: boolean;
};

function toPublic(row: z.infer<typeof DocumentRow>): DocumentPublic {
  const keywords = z.array(z.string()).parse(JSON.parse(row.keywords_json));
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    keywords,
    isDefault: Boolean(row.is_default),
  };
}

function list(sqlite: SqliteDatabase): DocumentPublic[] {
  return sqlite
    .prepare(`SELECT id, kind, label, path, keywords_json, is_default FROM documents ORDER BY label`)
    .all()
    .map((row) => toPublic(DocumentRow.parse(row)));
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
}

const MultipartValue = z.object({ value: z.unknown() });

function multipartString(fields: unknown, name: string): string | undefined {
  const bag = z.record(z.string(), z.unknown()).safeParse(fields);
  if (!bag.success) {
    return undefined;
  }
  const parsed = MultipartValue.safeParse(bag.data[name]);
  if (!parsed.success || typeof parsed.data.value !== "string") {
    return undefined;
  }
  return parsed.data.value;
}

export function registerDocumentRoutes(
  app: FastifyInstance,
  sqlite: SqliteDatabase,
  config: AppConfig,
): void {
  const docsDir = join(config.dataDir, "documents");

  app.get("/api/documents", async () => ({ documents: list(sqlite) }));

  app.post("/api/documents", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "file is required" });
    }
    const kind = DocumentKind.safeParse(multipartString(file.fields, "kind") ?? "resume");
    const labelField = multipartString(file.fields, "label") ?? file.filename;
    const keywordsField = multipartString(file.fields, "keywords") ?? "";
    const defaultField = multipartString(file.fields, "isDefault") ?? "false";
    if (!kind.success) {
      return reply.code(400).send({ error: "kind must be resume or cover_letter" });
    }
    const id = randomUUID();
    mkdirSync(docsDir, { recursive: true });
    const storedName = `${id}-${sanitizeName(file.filename)}`;
    const absPath = join(docsDir, storedName);
    const buffer = await file.toBuffer();
    writeFileSync(absPath, buffer);
    const keywords = keywordsField
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const isDefault = defaultField === "true" || defaultField === "1" || defaultField === "on";
    sqlite.transaction(() => {
      if (isDefault) {
        sqlite.prepare(`UPDATE documents SET is_default = 0 WHERE kind = ?`).run(kind.data);
      }
      sqlite
        .prepare(
          `INSERT INTO documents (id, kind, label, path, keywords_json, is_default) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, kind.data, labelField, absPath, JSON.stringify(keywords), isDefault ? 1 : 0);
    })();
    return { documents: list(sqlite) };
  });

  app.patch("/api/documents/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        label: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        isDefault: z.boolean().optional(),
      })
      .parse(request.body);
    const existing = sqlite
      .prepare(`SELECT id, kind, label, path, keywords_json, is_default FROM documents WHERE id = ?`)
      .get(params.id);
    if (existing === undefined) {
      return reply.code(404).send({ error: "not found" });
    }
    const row = DocumentRow.parse(existing);
    sqlite.transaction(() => {
      if (body.isDefault === true) {
        sqlite.prepare(`UPDATE documents SET is_default = 0 WHERE kind = ?`).run(row.kind);
      }
      sqlite
        .prepare(
          `UPDATE documents SET label = ?, keywords_json = ?, is_default = ? WHERE id = ?`,
        )
        .run(
          body.label ?? row.label,
          JSON.stringify(body.keywords ?? z.array(z.string()).parse(JSON.parse(row.keywords_json))),
          body.isDefault === undefined ? row.is_default : body.isDefault ? 1 : 0,
          params.id,
        );
    })();
    return { documents: list(sqlite) };
  });

  app.delete("/api/documents/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = sqlite.prepare(`SELECT path FROM documents WHERE id = ?`).get(params.id);
    const parsed = z.object({ path: z.string() }).safeParse(existing);
    if (!parsed.success) {
      return reply.code(404).send({ error: "not found" });
    }
    sqlite.prepare(`DELETE FROM documents WHERE id = ?`).run(params.id);
    if (existsSync(parsed.data.path)) {
      unlinkSync(parsed.data.path);
    }
    return { documents: list(sqlite) };
  });
}
