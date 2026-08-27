import { join } from "node:path";
import { createXenovaEmbedder } from "@autoapply/ai";
import type { EmbedFn } from "@autoapply/core";
import { migrate, openSqlite } from "@autoapply/db";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const sqlite = openSqlite(config.databasePath);
migrate(sqlite);

let embed: EmbedFn | undefined;
try {
  const embedder = await createXenovaEmbedder(join(config.dataDir, "embeddings"));
  embed = (text) => embedder.embed(text);
} catch {
  process.stderr.write("embeddings unavailable; alias matching still runs\n");
}

const app = await buildApp({ sqlite, config, embed });

const shutdown = async () => {
  await app.close();
  sqlite.close();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

await app.listen({ host: config.serverHost, port: config.serverPort });
