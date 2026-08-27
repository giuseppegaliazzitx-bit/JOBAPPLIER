import { hostFromUrl, humanDelayMs, shuffleBatch, type AppConfig, type EmbedFn } from "@autoapply/core";
import { claimNext, completeJob, enqueue, failJob, type SqliteDatabase } from "@autoapply/db";
import { z } from "zod";
import { countTodaySubmits } from "./applications.ts";
import { getActive, startRun } from "./runner.ts";
import { dailyCap } from "./settings.ts";

const JobRow = z.object({
  id: z.string(),
  url: z.string(),
});

export function enqueueBatch(sqlite: SqliteDatabase, jobIds: string[]): string[] {
  const jobs = jobIds.flatMap((id) => {
    const row = sqlite.prepare(`SELECT id, url FROM jobs WHERE id = ?`).get(id);
    const parsed = JobRow.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  const shuffled = shuffleBatch(jobs);
  const queued: string[] = [];
  for (const job of shuffled) {
    sqlite.prepare(`UPDATE jobs SET status = 'queued' WHERE id = ?`).run(job.id);
    enqueue(sqlite, "apply", { jobId: job.id, url: job.url });
    queued.push(job.id);
  }
  return queued;
}

export async function drainApplyQueue(options: {
  sqlite: SqliteDatabase;
  config: AppConfig;
  embed?: EmbedFn;
  skipDelay?: boolean;
}): Promise<void> {
  for (;;) {
    const item = claimNext(options.sqlite, "apply");
    if (!item) {
      return;
    }
    const payload = z.object({ jobId: z.string(), url: z.string() }).safeParse(JSON.parse(item.payloadJson));
    if (!payload.success) {
      failJob(options.sqlite, item.id, "invalid apply payload");
      continue;
    }
    const host = hostFromUrl(payload.data.url);
    const cap = dailyCap(options.sqlite, host);
    if (countTodaySubmits(options.sqlite, host) >= cap) {
      failJob(options.sqlite, item.id, "rate_limited");
      enqueue(options.sqlite, "blocked", {
        reason: "rate_limited",
        url: payload.data.url,
      });
      continue;
    }
    try {
      const runId = await startRun({
        sqlite: options.sqlite,
        dataDir: options.config.dataDir,
        jobId: payload.data.jobId,
        url: payload.data.url,
        embed: options.embed,
        skipDelay: options.skipDelay,
      });
      const run = getActive(runId);
      if (run) {
        await run.finished;
      }
      completeJob(options.sqlite, item.id);
    } catch (error) {
      failJob(options.sqlite, item.id, error instanceof Error ? error.message : "apply failed");
    }
    if (!options.skipDelay) {
      await new Promise((resolve) => setTimeout(resolve, humanDelayMs()));
    }
  }
}
