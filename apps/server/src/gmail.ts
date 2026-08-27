import { randomUUID } from "node:crypto";
import {
  GMAIL_READONLY_SCOPE,
  gmailAuthUrl,
  mailPlainText,
  type AppConfig,
  type MailMessage,
} from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import { fetchGmailImap, probeGmailImap } from "./gmail-imap.ts";
import { getSetting, setSetting } from "./settings.ts";

export type GmailMode = "imap" | "oauth" | "none";

export function gmailMode(config: AppConfig): GmailMode {
  if (!config.gmailClientId || !config.gmailClientSecret) {
    return "none";
  }
  return config.gmailClientId.includes("@") ? "imap" : "oauth";
}

export function gmailRedirectUri(config: AppConfig): string {
  return config.gmailRedirectUri ?? `http://${config.serverHost}:${config.serverPort}/api/gmail/callback`;
}

export function gmailStatus(sqlite: SqliteDatabase, config: AppConfig) {
  const mode = gmailMode(config);
  return {
    configured: mode !== "none",
    connected: getSetting(sqlite, "gmail:connected") === "on" || mode === "imap",
    mode,
    scope: GMAIL_READONLY_SCOPE,
  };
}

export async function startGmailConnect(
  sqlite: SqliteDatabase,
  config: AppConfig,
): Promise<{ url?: string; mode: GmailMode; ok: boolean }> {
  const mode = gmailMode(config);
  if (mode === "none") {
    throw new Error("GMAIL_CLIENT_ID is not set");
  }
  if (mode === "imap") {
    await probeGmailImap(config.gmailClientId ?? "", config.gmailClientSecret ?? "");
    setSetting(sqlite, "gmail:connected", "on");
    setSetting(sqlite, "gmail:mode", "imap");
    return { mode, ok: true };
  }
  const state = randomUUID();
  setSetting(sqlite, "gmail:oauth_state", state);
  return {
    mode,
    ok: true,
    url: gmailAuthUrl({
      clientId: config.gmailClientId ?? "",
      redirectUri: gmailRedirectUri(config),
      state,
    }),
  };
}

export async function finishGmailConnect(
  sqlite: SqliteDatabase,
  config: AppConfig,
  query: { code?: string; state?: string },
  post: typeof fetch = fetch,
): Promise<void> {
  const expected = getSetting(sqlite, "gmail:oauth_state");
  if (!query.code || !query.state || query.state !== expected) {
    throw new Error("invalid oauth state");
  }
  if (!config.gmailClientId || !config.gmailClientSecret) {
    throw new Error("GMAIL_CLIENT_ID is not set");
  }
  const body = new URLSearchParams({
    code: query.code,
    client_id: config.gmailClientId,
    client_secret: config.gmailClientSecret,
    redirect_uri: gmailRedirectUri(config),
    grant_type: "authorization_code",
  });
  const response = await post("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error("gmail token exchange failed");
  }
  const json: unknown = await response.json();
  const parsed = json as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (parsed.refresh_token) {
    setSetting(sqlite, "gmail:refresh_token", parsed.refresh_token);
  }
  if (parsed.access_token) {
    setSetting(sqlite, "gmail:access_token", parsed.access_token);
    const expires = Date.now() + (parsed.expires_in ?? 3600) * 1000;
    setSetting(sqlite, "gmail:access_expires", String(expires));
  }
  setSetting(sqlite, "gmail:connected", "on");
}

type GmailHeader = { name?: string; value?: string };
type GmailPayload = { mimeType?: string; body?: { data?: string }; parts?: GmailPayload[]; headers?: GmailHeader[] };

function decodeB64(data: string | undefined): string {
  if (!data) {
    return "";
  }
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function payloadText(payload: GmailPayload | undefined): { text: string; html?: string } {
  if (!payload) {
    return { text: "" };
  }
  if (payload.mimeType === "text/plain") {
    return { text: decodeB64(payload.body?.data) };
  }
  if (payload.mimeType === "text/html") {
    return { text: "", html: decodeB64(payload.body?.data) };
  }
  let text = "";
  let html: string | undefined;
  for (const part of payload.parts ?? []) {
    const nested = payloadText(part);
    if (nested.text) {
      text = nested.text;
    }
    if (nested.html) {
      html = nested.html;
    }
  }
  if (!text && html) {
    text = mailPlainText({ html, text: "" });
  }
  return { text, html };
}

export async function fetchGmailMessages(
  sqlite: SqliteDatabase,
  config: AppConfig,
  get: typeof fetch = fetch,
): Promise<MailMessage[]> {
  if (gmailMode(config) === "imap") {
    const messages = await fetchGmailImap(config.gmailClientId ?? "", config.gmailClientSecret ?? "");
    setSetting(sqlite, "gmail:connected", "on");
    return messages;
  }
  const token = getSetting(sqlite, "gmail:access_token");
  if (!token) {
    throw new Error("gmail is not connected");
  }
  const list = await get("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=newer_than:14d", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!list.ok) {
    throw new Error("gmail list failed");
  }
  const listed = (await list.json()) as { messages?: Array<{ id: string }> };
  const out: MailMessage[] = [];
  for (const item of listed.messages ?? []) {
    const res = await get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      continue;
    }
    const full = (await res.json()) as {
      id: string;
      internalDate?: string;
      payload?: GmailPayload;
    };
    const headers = full.payload?.headers ?? [];
    const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
    const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "unknown";
    const body = payloadText(full.payload);
    out.push({
      id: full.id,
      from,
      subject,
      text: body.text,
      html: body.html,
      occurredAt: full.internalDate
        ? new Date(Number(full.internalDate)).toISOString()
        : new Date().toISOString(),
    });
  }
  return out;
}
