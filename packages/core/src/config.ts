import { z } from "zod";

export const CURRENT_PHASE = 0;

export const AppConfigSchema = z.object({
  dataDir: z.string().min(1),
  databasePath: z.string().min(1),
  serverHost: z.string().min(1),
  serverPort: z.number().int().positive(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
