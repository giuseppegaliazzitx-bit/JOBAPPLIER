import { randomUUID } from "node:crypto";
import { enqueue, type SqliteDatabase } from "@autoapply/db";
import { getSetting } from "./settings.ts";

export type NotifyChannel = "email" | "desktop" | "telegram";

export async function dispatchNotification(
  sqlite: SqliteDatabase,
  message: string,
  options?: { fetch?: typeof fetch; channels?: NotifyChannel[] },
): Promise<void> {
  const channels =
    options?.channels ??
    (["email", "desktop", "telegram"] as NotifyChannel[]).filter((channel) => {
      if (channel === "desktop") {
        return getSetting(sqlite, "notify:desktop") !== "off";
      }
      return getSetting(sqlite, `notify:${channel}`) === "on";
    });
  const now = new Date().toISOString();
  for (const channel of channels) {
    const id = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO outbound_notifications (id, channel, message, created_at, sent_at, last_error)
         VALUES (?, ?, ?, ?, NULL, NULL)`,
      )
      .run(id, channel, message, now);
    if (channel === "desktop") {
      enqueue(sqlite, "notify", { message });
      sqlite.prepare(`UPDATE outbound_notifications SET sent_at = ? WHERE id = ?`).run(now, id);
    }
    if (channel === "email") {
      enqueue(sqlite, "email", { message });
      sqlite.prepare(`UPDATE outbound_notifications SET sent_at = ? WHERE id = ?`).run(now, id);
    }
    if (channel === "telegram") {
      const token = getSetting(sqlite, "telegram:bot_token");
      const chat = getSetting(sqlite, "telegram:chat_id");
      if (!token || !chat) {
        sqlite
          .prepare(`UPDATE outbound_notifications SET last_error = ? WHERE id = ?`)
          .run("telegram is not configured", id);
        continue;
      }
      try {
        const post = options?.fetch ?? fetch;
        const res = await post(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chat, text: message }),
        });
        if (!res.ok) {
          throw new Error("telegram send failed");
        }
        sqlite.prepare(`UPDATE outbound_notifications SET sent_at = ? WHERE id = ?`).run(now, id);
      } catch (error) {
        const text = error instanceof Error ? error.message : "telegram failed";
        sqlite.prepare(`UPDATE outbound_notifications SET last_error = ? WHERE id = ?`).run(text, id);
      }
    }
  }
}

export function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function toIcsDate(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function interviewsToIcs(
  events: Array<{ title: string; scheduledAt: string; location?: string | null }>,
): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Autoapply//Tracker//EN"];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `DTSTART:${toIcsDate(event.scheduledAt)}`,
      `SUMMARY:${icsEscape(event.title)}`,
      event.location ? `LOCATION:${icsEscape(event.location)}` : "LOCATION:",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
