import { AppConfigSchema, CURRENT_PHASE, EnvSchema, type AppConfig } from "@autoapply/core";
import { resolveDataDir, resolveDbPath } from "@autoapply/db";
import { loadEnvFile } from "./load-env.ts";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadEnvFile();
  const parsed = EnvSchema.parse({
    AUTOAPPLY_HOME: env.AUTOAPPLY_HOME,
    AUTOAPPLY_DB: env.AUTOAPPLY_DB,
    HOST: env.HOST,
    PORT: env.PORT,
    WEB_ORIGIN: env.WEB_ORIGIN,
    FETCH_TIMEOUT_MS: env.FETCH_TIMEOUT_MS,
    FETCH_USER_AGENT: env.FETCH_USER_AGENT,
  });
  if (parsed.AUTOAPPLY_HOME) {
    env.AUTOAPPLY_HOME = parsed.AUTOAPPLY_HOME;
  }
  if (parsed.AUTOAPPLY_DB) {
    env.AUTOAPPLY_DB = parsed.AUTOAPPLY_DB;
  }
  return AppConfigSchema.parse({
    dataDir: resolveDataDir(),
    databasePath: resolveDbPath(),
    serverHost: parsed.HOST,
    serverPort: parsed.PORT,
    webOrigin: parsed.WEB_ORIGIN,
    fetchTimeoutMs: parsed.FETCH_TIMEOUT_MS,
    fetchUserAgent: parsed.FETCH_USER_AGENT,
  });
}

export const SERVER_PHASE = CURRENT_PHASE;
