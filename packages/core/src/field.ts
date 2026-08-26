import { z } from "zod";

export const FieldTypeSchema = z.enum([
  "text",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "textarea",
  "select",
  "multiselect",
  "radio",
  "checkbox",
  "checkbox_group",
  "file",
  "custom",
]);

export type FieldType = z.infer<typeof FieldTypeSchema>;

export const WidgetKindSchema = z.enum([
  "native",
  "combobox",
  "typeahead",
  "react-select",
  "rich-text",
  "unknown",
]);

export type WidgetKind = z.infer<typeof WidgetKindSchema>;

export const SelectorStrategySchema = z.enum([
  "label",
  "role",
  "testid",
  "name",
  "placeholder",
  "text",
  "css",
]);

export type SelectorStrategy = z.infer<typeof SelectorStrategySchema>;

export const SelectorSchema = z.object({
  strategy: SelectorStrategySchema,
  value: z.string().min(1),
});

export type Selector = z.infer<typeof SelectorSchema>;

export const SelectorSpecSchema = z.object({
  primary: SelectorSchema,
  fallbacks: z.array(SelectorSchema),
});

export type SelectorSpec = z.infer<typeof SelectorSpecSchema>;

export const FieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export type FieldOption = z.infer<typeof FieldOptionSchema>;

export const FieldDescriptorSchema = z.object({
  fingerprint: z.string().min(1),
  labelRaw: z.string(),
  labelNorm: z.string(),
  helpText: z.string().optional(),
  type: FieldTypeSchema,
  widget: WidgetKindSchema,
  required: z.boolean(),
  options: z.array(FieldOptionSchema).optional(),
  selector: SelectorSpecSchema,
  containerPath: z.string(),
  visible: z.boolean(),
  disabled: z.boolean(),
  currentValue: z.string().optional(),
  sectionHeading: z.string().optional(),
});

export type FieldDescriptor = z.infer<typeof FieldDescriptorSchema>;
