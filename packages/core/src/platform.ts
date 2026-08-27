import { z } from "zod";

export const PlatformSchema = z.enum([
  "greenhouse",
  "lever",
  "workday",
  "icims",
  "taleo",
  "smartrecruiters",
  "ashby",
  "jobvite",
  "bamboohr",
  "recruitee",
  "unknown",
]);

export type Platform = z.infer<typeof PlatformSchema>;

export const ATS_PLATFORMS = [
  "greenhouse",
  "lever",
  "workday",
  "icims",
  "taleo",
  "smartrecruiters",
  "ashby",
  "jobvite",
  "bamboohr",
  "recruitee",
] as const satisfies ReadonlyArray<Exclude<Platform, "unknown">>;

export const JobSourceSchema = z.enum([
  "linkedin",
  "indeed",
  "glassdoor",
  "company",
  "other",
]);

export type JobSource = z.infer<typeof JobSourceSchema>;

export const ApplyKindSchema = z.enum(["easy_apply", "external", "unknown"]);

export type ApplyKind = z.infer<typeof ApplyKindSchema>;
