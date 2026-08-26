import { z } from "zod";

export const PlatformSchema = z.enum([
  "greenhouse",
  "lever",
  "workday",
  "icims",
  "taleo",
  "smartrecruiters",
  "ashby",
  "unknown",
]);

export type Platform = z.infer<typeof PlatformSchema>;
