import { connect, type TLSSocket } from "node:tls";
import { mailPlainText, stripTags, type MailMessage } from "@autoapply/core";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function imapDate(date: Date): string {
  return `${date.getUTCDate()}-${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

class ImapClient {
  private socket: TLSSocket;
  private buffer = Buffer.alloc(0);
  private tag = 0;
  private waiters: Array<(chunk: Buffer) => void> = [];

  constructor(socket: TLSSocket) {
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const pending = this.waiters.shift();
      if (pending) {
        pending(Buffer.alloc(0));
      }
    });
  }

  static async open(user: string, pass: string): Promise<ImapClient> {
    const socket = await new Promise<TLSSocket>((resolve, reject) => {
      const tls = connect({ host: "imap.gmail.com", port: 993, servername: "imap.gmail.com" }, () => resolve(tls));
      tls.on("error", reject);
    });
    const client = new ImapClient(socket);
    await client.readLine();
    const login = await client.command(`LOGIN ${quote(user)} ${quote(pass)}`);
    if (!/^\w+ OK /m.test(login)) {
      await client.close();
      throw new Error("gmail IMAP login failed");
    }
    return client;
  }

  private readMore(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(() => resolve());
    });
  }

  private async readLine(): Promise<string> {
    for (;;) {
      const idx = this.buffer.indexOf("\r\n");
      if (idx >= 0) {
        const line = this.buffer.subarray(0, idx).toString("utf8");
        this.buffer = this.buffer.subarray(idx + 2);
        return line;
      }
      await this.readMore();
    }
  }

  private async readBytes(n: number): Promise<Buffer> {
    while (this.buffer.length < n) {
      await this.readMore();
    }
    const slice = this.buffer.subarray(0, n);
    this.buffer = this.buffer.subarray(n);
    return slice;
  }

  async command(body: string): Promise<string> {
    this.tag += 1;
    const tag = `A${this.tag}`;
    this.socket.write(`${tag} ${body}\r\n`);
    const lines: string[] = [];
    for (;;) {
      const line = await this.readLine();
      const literal = line.match(/\{(\d+)\}\s*$/);
      if (literal?.[1]) {
        const raw = await this.readBytes(Number(literal[1]));
        lines.push(line);
        lines.push(raw.toString("utf8"));
        continue;
      }
      lines.push(line);
      if (line.startsWith(`${tag} `)) {
        return lines.join("\n");
      }
    }
  }

  async fetchUid(uid: string): Promise<string | null> {
    this.tag += 1;
    const tag = `A${this.tag}`;
    this.socket.write(`${tag} UID FETCH ${uid} (RFC822)\r\n`);
    let rfc: string | null = null;
    for (;;) {
      const line = await this.readLine();
      const lit = line.match(/RFC822\s+\{(\d+)\}\s*$/i);
      if (lit?.[1]) {
        rfc = (await this.readBytes(Number(lit[1]))).toString("utf8");
        continue;
      }
      if (line.startsWith(`${tag} `)) {
        if (!/ OK /i.test(line)) {
          throw new Error(line);
        }
        return rfc;
      }
    }
  }

  async fetchRecent(): Promise<MailMessage[]> {
    await this.command("SELECT INBOX");
    const since = imapDate(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
    const search = await this.command(`UID SEARCH SINCE ${since}`);
    const uidLine = search.split("\n").find((line) => line.startsWith("* SEARCH"));
    const uids = (uidLine ?? "")
      .replace(/^\* SEARCH/i, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(-50);
    const out: MailMessage[] = [];
    for (const uid of uids) {
      const rfc = await this.fetchUid(uid);
      if (!rfc) {
        continue;
      }
      out.push(parseRfc822(uid, rfc));
    }
    return out;
  }

  async close(): Promise<void> {
    try {
      await this.command("LOGOUT");
    } catch {
      // socket may already be closing
    }
    this.socket.end();
  }
}

function headerValue(headers: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.*(?:\\r?\\n[ \\t].*)*)`, "im");
  const match = headers.match(re);
  if (!match?.[1]) {
    return "";
  }
  return match[1].replace(/\r?\n[ \t]+/g, " ").trim();
}

function parseRfc822(id: string, raw: string): MailMessage {
  const split = raw.indexOf("\r\n\r\n");
  const alt = raw.indexOf("\n\n");
  const idx = split >= 0 ? split : alt;
  const headers = idx >= 0 ? raw.slice(0, idx) : raw;
  const body = idx >= 0 ? raw.slice(idx).trim() : "";
  const from = headerValue(headers, "From") || "unknown";
  const subject = headerValue(headers, "Subject");
  const dateRaw = headerValue(headers, "Date");
  const occurred = dateRaw ? new Date(dateRaw) : new Date();
  const lower = headers.toLowerCase();
  const html = lower.includes("text/html");
  const text = html ? mailPlainText({ html: body, text: "" }) : stripTags(body).slice(0, 20_000);
  return {
    id: `imap:${id}`,
    from,
    subject,
    text,
    html: html ? body : undefined,
    occurredAt: Number.isNaN(occurred.getTime()) ? new Date().toISOString() : occurred.toISOString(),
  };
}

export async function probeGmailImap(user: string, pass: string): Promise<void> {
  const client = await ImapClient.open(user, pass.replace(/\s+/g, ""));
  await client.close();
}

export async function fetchGmailImap(user: string, pass: string): Promise<MailMessage[]> {
  const client = await ImapClient.open(user, pass.replace(/\s+/g, ""));
  try {
    return await client.fetchRecent();
  } finally {
    await client.close();
  }
}
