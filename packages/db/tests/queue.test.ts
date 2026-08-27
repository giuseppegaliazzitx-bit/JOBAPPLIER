import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openSqlite } from "../src/client.ts";
import { migrate } from "../src/migrate.ts";
import { claimNext, completeJob, enqueue, failJob } from "../src/queue.ts";

describe("sqlite queue", () => {
  it("enqueues, claims, and completes in order", () => {
    const sqlite = openSqlite(join(mkdtempSync(join(tmpdir(), "autoapply-q-")), "t.db"));
    try {
      migrate(sqlite);
      enqueue(sqlite, "ingest_job", { url: "https://example.com/a" });
      enqueue(sqlite, "ingest_job", { url: "https://example.com/b" });
      const first = claimNext(sqlite, "ingest_job");
      expect(first?.status).toBe("running");
      expect(JSON.parse(first?.payloadJson ?? "{}")).toEqual({ url: "https://example.com/a" });
      if (!first) {
        throw new Error("expected a queue item");
      }
      completeJob(sqlite, first.id);
      const second = claimNext(sqlite, "ingest_job");
      if (!second) {
        throw new Error("expected a second queue item");
      }
      failJob(sqlite, second.id, "fetch failed");
      expect(claimNext(sqlite, "ingest_job")).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
