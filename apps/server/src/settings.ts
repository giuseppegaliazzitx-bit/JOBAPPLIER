import { ATS_PLATFORMS, DEFAULT_DAILY_CAP, GMAIL_READONLY_SCOPE, hostFromUrl } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";

export const TOS_AUTOMATION =
  "Turning automation on for a site is your call. Many employer terms of service prohibit automated applications. Per-site automation defaults off.";

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

export function isAutopilotOn(sqlite: SqliteDatabase, platform: string, url?: string): boolean {
  if (url) {
    const host = hostFromUrl(url);
    const hostSetting = getSetting(sqlite, `autopilot:host:${host}`);
    if (hostSetting === "on") {
      return true;
    }
    if (hostSetting === "off") {
      return false;
    }
  }
  return getSetting(sqlite, `autopilot:${platform}`) === "on";
}

export function disableAutopilot(sqlite: SqliteDatabase, platform: string): void {
  setSetting(sqlite, `autopilot:${platform}`, "off");
}

export function dailyCap(sqlite: SqliteDatabase, host?: string): number {
  if (host) {
    const specific = getSetting(sqlite, `daily_cap:${host}`);
    if (specific !== undefined) {
      const n = Number(specific);
      if (Number.isFinite(n) && n >= 1) {
        return Math.floor(n);
      }
    }
  }
  const global = getSetting(sqlite, "daily_cap");
  if (global !== undefined) {
    const n = Number(global);
    if (Number.isFinite(n) && n >= 1) {
      return Math.floor(n);
    }
  }
  return DEFAULT_DAILY_CAP;
}

export function readSettings(sqlite: SqliteDatabase) {
  const sites: Record<string, boolean> = {};
  for (const platform of ATS_PLATFORMS) {
    sites[platform] = isAutopilotOn(sqlite, platform);
  }
  sites.unknown = isAutopilotOn(sqlite, "unknown");
  return {
    sites,
    dailyCap: dailyCap(sqlite),
    captchaPolicy: "sessionkit_solve" as const,
    twoFaPolicy: "detect_pause_notify" as const,
    gmailConnected: getSetting(sqlite, "gmail:connected") === "on",
    gmailScope: GMAIL_READONLY_SCOPE,
    gmailMode: getSetting(sqlite, "gmail:mode") ?? (getSetting(sqlite, "gmail:connected") === "on" ? "oauth" : "none"),
    tos: TOS_AUTOMATION,
    salaryFloor: Number(getSetting(sqlite, "salary_floor") ?? 0) || 0,
    notify: {
      email: getSetting(sqlite, "notify:email") === "on",
      desktop: getSetting(sqlite, "notify:desktop") !== "off",
      telegram: getSetting(sqlite, "notify:telegram") === "on",
    },
  };
}

export function writeSettings(
  sqlite: SqliteDatabase,
  patch: {
    sites?: Record<string, boolean>;
    dailyCap?: number;
    salaryFloor?: number;
    notify?: { email?: boolean; desktop?: boolean; telegram?: boolean };
    telegramBotToken?: string;
    telegramChatId?: string;
  },
): ReturnType<typeof readSettings> {
  if (patch.sites) {
    for (const [platform, on] of Object.entries(patch.sites)) {
      setSetting(sqlite, `autopilot:${platform}`, on ? "on" : "off");
    }
  }
  if (patch.dailyCap !== undefined) {
    setSetting(sqlite, "daily_cap", String(Math.max(1, Math.floor(patch.dailyCap))));
  }
  if (patch.salaryFloor !== undefined) {
    setSetting(sqlite, "salary_floor", String(Math.max(0, Math.floor(patch.salaryFloor))));
  }
  if (patch.notify) {
    if (patch.notify.email !== undefined) {
      setSetting(sqlite, "notify:email", patch.notify.email ? "on" : "off");
    }
    if (patch.notify.desktop !== undefined) {
      setSetting(sqlite, "notify:desktop", patch.notify.desktop ? "on" : "off");
    }
    if (patch.notify.telegram !== undefined) {
      setSetting(sqlite, "notify:telegram", patch.notify.telegram ? "on" : "off");
    }
  }
  if (patch.telegramBotToken !== undefined) {
    setSetting(sqlite, "telegram:bot_token", patch.telegramBotToken);
  }
  if (patch.telegramChatId !== undefined) {
    setSetting(sqlite, "telegram:chat_id", patch.telegramChatId);
  }
  return readSettings(sqlite);
}
