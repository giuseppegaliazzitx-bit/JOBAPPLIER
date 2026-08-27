import { z } from "zod";

export const CURRENT_PHASE = 10;

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

export const EnvSchema = z.object({
  AUTOAPPLY_HOME: optionalText,
  AUTOAPPLY_DB: optionalText,
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(8787),
  WEB_ORIGIN: z.string().min(1).default("http://127.0.0.1:5173"),
  FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  FETCH_USER_AGENT: z
    .string()
    .min(1)
    .default(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ),
  XAI_API_KEY: optionalText,
  AI_RUN_TOKEN_CEILING: z.coerce.number().int().positive().default(50_000),
  AI_DAY_SPEND_USD: z.coerce.number().positive().default(2),
  GMAIL_CLIENT_ID: optionalText,
  GMAIL_CLIENT_SECRET: optionalText,
  GMAIL_REDIRECT_URI: optionalText,
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export const AppConfigSchema = z.object({
  dataDir: z.string().min(1),
  databasePath: z.string().min(1),
  serverHost: z.string().min(1),
  serverPort: z.number().int().positive(),
  webOrigin: z.string().min(1),
  fetchTimeoutMs: z.number().int().positive(),
  fetchUserAgent: z.string().min(1),
  xaiApiKey: z.string().min(1).optional(),
  aiRunTokenCeiling: z.number().int().positive(),
  aiDaySpendUsd: z.number().positive(),
  gmailClientId: z.string().min(1).optional(),
  gmailClientSecret: z.string().min(1).optional(),
  gmailRedirectUri: z.string().min(1).optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
