import { z } from "zod";
import { ApplyKindSchema, PlatformSchema } from "./platform.ts";
import { JobStatusSchema } from "./status.ts";

export const JobPublicSchema = z.object({
  id: z.string(),
  url: z.string(),
  canonicalUrl: z.string(),
  dedupKey: z.string(),
  source: z.string(),
  companyId: z.string().nullable(),
  companyName: z.string().nullable(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  platform: PlatformSchema,
  applyKind: ApplyKindSchema,
  status: JobStatusSchema,
  postedAt: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string(),
  fitScore: z.number().nullable().optional(),
  salaryMin: z.number().nullable().optional(),
  salaryMax: z.number().nullable().optional(),
  staffingAgency: z.boolean().optional(),
  blacklisted: z.boolean().optional(),
});

export type JobPublic = z.infer<typeof JobPublicSchema>;

export const IngestResultSchema = z.discriminatedUnion("status", [
  z.object({ url: z.string(), status: z.literal("created"), job: JobPublicSchema }),
  z.object({ url: z.string(), status: z.literal("deduped"), job: JobPublicSchema }),
  z.object({ url: z.string(), status: z.literal("error"), message: z.string() }),
]);

export type IngestResult = z.infer<typeof IngestResultSchema>;
