import { openSqlite, migrate } from "@autoapply/db";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const sqlite = openSqlite(config.databasePath);
migrate(sqlite);

const app = await buildApp();

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
