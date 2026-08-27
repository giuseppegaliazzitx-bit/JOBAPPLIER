import type { FieldType } from "./field.ts";

const TEXTISH: ReadonlySet<FieldType> = new Set([
  "text",
  "textarea",
  "email",
  "tel",
  "url",
  "number",
  "date",
]);

const CHOICE: ReadonlySet<FieldType> = new Set([
  "select",
  "multiselect",
  "radio",
  "checkbox",
  "checkbox_group",
]);

export function typesCompatible(stored: FieldType, live: FieldType): boolean {
  if (stored === live) {
    return true;
  }
  if (stored === "file" || live === "file") {
    return stored === live;
  }
  if (stored === "custom" || live === "custom") {
    return stored === live;
  }
  if (TEXTISH.has(stored) && TEXTISH.has(live)) {
    return true;
  }
  if (CHOICE.has(stored) && CHOICE.has(live)) {
    return true;
  }
  return false;
}
