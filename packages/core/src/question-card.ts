import { z } from "zod";
import { AnswerScopeSchema } from "./answer.ts";
import { FieldOptionSchema, FieldTypeSchema, WidgetKindSchema } from "./field.ts";

export const BlockedJobSchema = z.object({
  jobId: z.string().optional(),
  title: z.string(),
  url: z.string().optional(),
});

export type BlockedJob = z.infer<typeof BlockedJobSchema>;

export const QuestionCardSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  labelRaw: z.string(),
  labelNorm: z.string(),
  type: FieldTypeSchema,
  widget: WidgetKindSchema,
  required: z.boolean(),
  options: z.array(FieldOptionSchema).optional(),
  sectionHeading: z.string().optional(),
  occurrences: z.number().int(),
  blocked: z.array(BlockedJobSchema),
  suggestion: z
    .object({
      value: z.string(),
      matchedLabel: z.string(),
      similarity: z.number(),
    })
    .optional(),
  answer: z
    .object({
      canonicalValue: z.string(),
      scope: AnswerScopeSchema,
    })
    .nullable(),
});

export type QuestionCard = z.infer<typeof QuestionCardSchema>;
