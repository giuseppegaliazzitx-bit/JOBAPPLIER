import { CURRENT_PHASE, type AppConfig } from "@autoapply/core";
import { resolveDataDir, resolveDbPath } from "@autoapply/db";

export function loadConfig(): AppConfig {
  const portRaw = process.env.PORT ?? "8787";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got ${portRaw}`);
  }
  return {
    dataDir: resolveDataDir(),
    databasePath: resolveDbPath(),
    serverHost: process.env.HOST ?? "127.0.0.1",
    serverPort: port,
  };
}

export const SERVER_PHASE = CURRENT_PHASE;
