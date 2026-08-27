import type { SqliteDatabase } from "@autoapply/db";

export function getSetting(sqlite: SqliteDatabase, key: string): string | undefined {
  const row = sqlite.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  if (row && typeof row === "object" && "value" in row && typeof row.value === "string") {
    return row.value;
  }
  return undefined;
}

export function setSetting(sqlite: SqliteDatabase, key: string, value: string): void {
  sqlite
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function isAutopilotOn(sqlite: SqliteDatabase, platform: string): boolean {
  return getSetting(sqlite, `autopilot:${platform}`) !== "off";
}

export function disableAutopilot(sqlite: SqliteDatabase, platform: string): void {
  setSetting(sqlite, `autopilot:${platform}`, "off");
}
