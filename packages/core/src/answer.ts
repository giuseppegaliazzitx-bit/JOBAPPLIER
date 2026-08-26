import { z } from "zod";

export const AnswerScopeSchema = z.enum(["global", "company", "job"]);

export type AnswerScope = z.infer<typeof AnswerScopeSchema>;

export const MatchTierSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export type MatchTier = z.infer<typeof MatchTierSchema>;
