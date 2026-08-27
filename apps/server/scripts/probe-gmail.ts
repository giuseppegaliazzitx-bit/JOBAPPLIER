import { resolve } from "node:path";
import dotenv from "dotenv";
import { fetchGmailImap, probeGmailImap } from "../src/gmail-imap.ts";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

const user = process.env.GMAIL_CLIENT_ID ?? "";
const pass = process.env.GMAIL_CLIENT_SECRET ?? "";
const mode = user.includes("@") ? "imap" : user ? "oauth" : "none";
process.stdout.write(`mode=${mode}\n`);
if (mode !== "imap") {
  process.stdout.write("not imap; set GMAIL_CLIENT_ID to your gmail address and GMAIL_CLIENT_SECRET to an app password\n");
  process.exit(1);
}

try {
  await probeGmailImap(user, pass);
  process.stdout.write("login=ok\n");
  const messages = await fetchGmailImap(user, pass);
  process.stdout.write(`fetched=${messages.length}\n`);
  for (const message of messages.slice(0, 5)) {
    process.stdout.write(`- ${message.occurredAt} ${(message.subject || "(no subject)").slice(0, 70)}\n`);
  }
} catch (error) {
  process.stdout.write(`error=${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
