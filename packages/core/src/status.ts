import { z } from "zod";

export const JobStatusSchema = z.enum([
  "inbox",
  "queued",
  "running",
  "blocked",
  "applied",
  "skipped",
  "blacklisted",
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const RunModeSchema = z.enum(["manual", "preflight", "autopilot", "record"]);

export type RunMode = z.infer<typeof RunModeSchema>;

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "blocked",
  "succeeded",
  "failed",
  "aborted",
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

export const ApplicationStatusSchema = z.enum([
  "applied",
  "viewed",
  "screening",
  "interview",
  "offer",
  "rejected",
  "ghosted",
]);

export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const RecipeVersionStatusSchema = z.enum([
  "proposed",
  "shadow",
  "active",
  "degraded",
  "retired",
]);

export type RecipeVersionStatus = z.infer<typeof RecipeVersionStatusSchema>;

export const FieldResolveStatusSchema = z.enum([
  "resolved",
  "user_approved",
  "unanswered",
  "suggested",
]);

export type FieldResolveStatus = z.infer<typeof FieldResolveStatusSchema>;
