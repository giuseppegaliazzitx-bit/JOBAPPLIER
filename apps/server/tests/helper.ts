import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppConfigSchema, type AppConfig } from "@autoapply/core";
import { migrate, openSqlite, type SqliteDatabase } from "@autoapply/db";

export function tempSqlite(): { sqlite: SqliteDatabase; config: AppConfig; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "autoapply-server-"));
  const databasePath = join(dir, "autoapply.db");
  const sqlite = openSqlite(databasePath);
  migrate(sqlite);
  const config = AppConfigSchema.parse({
    dataDir: dir,
    databasePath,
    serverHost: "127.0.0.1",
    serverPort: 8787,
    webOrigin: "http://127.0.0.1:5173",
    fetchTimeoutMs: 5000,
    fetchUserAgent: "autoapply-test",
  });
  return { sqlite, config, dir };
}
