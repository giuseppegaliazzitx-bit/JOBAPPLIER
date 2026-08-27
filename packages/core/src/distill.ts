import { createHash } from "node:crypto";
import {
  DISTILLED_PAGE_BYTE_CAP,
  DISTILLED_PAGE_FIELD_CAP,
  DistilledPageSchema,
  HTML_TAG_RE,
  PII_EMAIL_RE,
  PII_PHONE_RE,
  PII_SSN_RE,
  type DistilledField,
  type DistilledPage,
} from "./distilled-page.ts";
import { HIGH_CONFIDENCE_LABEL_SOURCES, type FieldInventory } from "./field.ts";
import type { ProfileValues } from "./profile.ts";
import { profileValuesInText } from "./recipe-parameterize.ts";

export function scrubPii(text: string): string {
  return text
    .replace(PII_EMAIL_RE, "[redacted-email]")
    .replace(PII_PHONE_RE, "[redacted-phone]")
    .replace(PII_SSN_RE, "[redacted-ssn]");
}

function quote(value: string): string {
  return `"${scrubPii(value).replace(/"/g, "'")}"`;
}

export function renderDistilledField(field: DistilledField): string {
  const parts = [`[${field.id}]`, field.type];
  if (field.widget && field.widget !== "native") {
    parts.push(`widget=${field.widget}`);
  }
  if (field.required) {
    parts.push("required");
  }
  parts.push(field.label ? `label=${quote(field.label)}` : "label=?");
  if (field.name) parts.push(`name=${quote(field.name)}`);
  if (field.aria) parts.push(`aria=${quote(field.aria)}`);
  if (field.placeholder) parts.push(`placeholder=${quote(field.placeholder)}`);
  if (field.options && field.options.length > 0) {
    const clipped = field.options.slice(0, 20).map((item) => scrubPii(item).slice(0, 80));
    parts.push(`options=${quote(clipped.join("|"))}`);
  }
  if (field.accept) parts.push(`accept=${quote(field.accept)}`);
  return parts.join(" ");
}

export function renderDistilledPage(page: DistilledPage): string {
  const parsed = DistilledPageSchema.parse(page);
  const lines = [
    `PAGE title=${quote(parsed.title)}${parsed.step ? ` step=${parsed.step}` : ""}`,
    ...parsed.fields.map(renderDistilledField),
    `BUTTONS: ${parsed.buttons.length > 0 ? parsed.buttons.map((item) => quote(scrubPii(item))).join(" | ") : "none"}`,
    `ERRORS: ${parsed.errors.length > 0 ? parsed.errors.map((item) => quote(scrubPii(item))).join(" | ") : "none"}`,
  ];
  return lines.join("\n");
}

export function distilledByteSize(page: DistilledPage): number {
  return Buffer.byteLength(renderDistilledPage(page), "utf8");
}

export function paginateDistilled(page: DistilledPage): DistilledPage[] {
  const base = {
    title: page.title,
    step: page.step,
    buttons: page.buttons,
    errors: page.errors,
  };
  if (page.fields.length === 0) {
    return [DistilledPageSchema.parse({ ...base, fields: [] })];
  }
  const pages: DistilledPage[] = [];
  let chunk: DistilledField[] = [];
  const flush = () => {
    if (chunk.length === 0) {
      return;
    }
    pages.push({ ...base, fields: chunk });
    chunk = [];
  };
  for (const field of page.fields) {
    const next = [...chunk, field];
    const candidate: DistilledPage = { ...base, fields: next };
    const overFields = next.length > DISTILLED_PAGE_FIELD_CAP;
    let overBytes = false;
    if (next.length <= DISTILLED_PAGE_FIELD_CAP) {
      overBytes = distilledByteSize(candidate) > DISTILLED_PAGE_BYTE_CAP;
    }
    if (chunk.length > 0 && (overFields || overBytes)) {
      flush();
    }
    chunk.push(field);
  }
  flush();
  return pages.map((item, index) =>
    DistilledPageSchema.parse({
      ...item,
      step: item.step ? `${item.step} p${index + 1}` : `p${index + 1}/${pages.length}`,
    }),
  );
}

export function hashDistilledInput(purpose: string, page: DistilledPage, extra = ""): string {
  const normalized = `${purpose}\n${renderDistilledPage(page)}\n${scrubPii(extra)}`.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function inventoryToDistilled(inventory: FieldInventory, step?: string): DistilledPage {
  const fields: DistilledField[] = inventory.fields.map((field, index) => {
    const name = field.selector.fallbacks.find((item) => item.strategy === "name")?.value
      ?? (field.selector.primary.strategy === "name" ? field.selector.primary.value : undefined);
    const confident = HIGH_CONFIDENCE_LABEL_SOURCES.includes(field.labelSource);
    return {
      id: `f${index + 1}`,
      type: field.type,
      required: field.required,
      label: confident && field.labelRaw.length > 0 ? field.labelRaw : null,
      name,
      aria: undefined,
      placeholder: field.selector.fallbacks.find((item) => item.strategy === "placeholder")?.value,
      options: field.options?.map((item) => item.label),
      widget: field.widget,
    };
  });
  return {
    title: inventory.title,
    step,
    fields,
    buttons: [],
    errors: [],
  };
}

export function distilledNeedsScreenshot(page: DistilledPage): boolean {
  return page.fields.some(
    (field) => field.widget === "unknown" || field.label === null || field.widget === "rich-text",
  );
}

export function assertDistilledSafe(page: DistilledPage, profile?: ProfileValues): void {
  const rendered = renderDistilledPage(page);
  if (HTML_TAG_RE.test(rendered) || HTML_TAG_RE.test(JSON.stringify(page))) {
    throw new Error("distilled payload contains a raw HTML tag");
  }
  if (profile) {
    const hits = profileValuesInText(rendered, profile);
    if (hits.length > 0) {
      throw new Error(`distilled payload contains profile values: ${hits.join(", ")}`);
    }
  }
}
