import { z } from "zod";
import { FieldTypeSchema } from "./field.ts";

export const DISTILLED_PAGE_FIELD_CAP = 60;
export const DISTILLED_PAGE_BYTE_CAP = 8 * 1024;

export const DistilledFieldSchema = z.object({
  id: z.string().min(1),
  type: FieldTypeSchema,
  required: z.boolean(),
  label: z.string().nullable(),
  name: z.string().optional(),
  aria: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  accept: z.string().optional(),
});

export type DistilledField = z.infer<typeof DistilledFieldSchema>;

export const DistilledPageSchema = z.object({
  title: z.string(),
  step: z.string().optional(),
  fields: z.array(DistilledFieldSchema).max(DISTILLED_PAGE_FIELD_CAP),
  buttons: z.array(z.string()),
  errors: z.array(z.string()),
});

export type DistilledPage = z.infer<typeof DistilledPageSchema>;

export const AiPurposeSchema = z.enum([
  "classify_page",
  "resolve_labels",
  "map_option",
  "repair_step",
  "draft_answer",
  "write_cover_letter",
]);

export type AiPurpose = z.infer<typeof AiPurposeSchema>;
