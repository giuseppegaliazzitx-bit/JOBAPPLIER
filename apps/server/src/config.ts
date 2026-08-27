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
    XAI_API_KEY: env.XAI_API_KEY,
    AI_RUN_TOKEN_CEILING: env.AI_RUN_TOKEN_CEILING,
    AI_DAY_SPEND_USD: env.AI_DAY_SPEND_USD,
    GMAIL_CLIENT_ID: env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: env.GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI: env.GMAIL_REDIRECT_URI,
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
    xaiApiKey: parsed.XAI_API_KEY,
    aiRunTokenCeiling: parsed.AI_RUN_TOKEN_CEILING,
    aiDaySpendUsd: parsed.AI_DAY_SPEND_USD,
    gmailClientId: parsed.GMAIL_CLIENT_ID,
    gmailClientSecret: parsed.GMAIL_CLIENT_SECRET,
    gmailRedirectUri: parsed.GMAIL_REDIRECT_URI,
  });
}

export const SERVER_PHASE = CURRENT_PHASE;
