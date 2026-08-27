import { createHash } from "node:crypto";
import { collapseWs, decodeEntities } from "./normalize.ts";
import type { FieldOption, FieldType } from "./field.ts";

export function normalizeLabel(raw: string): string {
  return collapseWs(
    decodeEntities(raw)
      .toLowerCase()
      .replace(/\*/g, " ")
      .replace(/\(required\)/gi, " ")
      .replace(/\(optional\)/gi, " ")
      .replace(/[?:!.]+$/g, ""),
  );
}

export function optionsHash(options: FieldOption[] | undefined): string {
  if (!options || options.length === 0) {
    return "";
  }
  const canon = options
    .map((option) => `${option.value}\t${option.label}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canon).digest("hex");
}

export function fieldFingerprint(
  labelNorm: string,
  type: FieldType,
  options: FieldOption[] | undefined,
): string {
  const hash = optionsHash(options);
  return createHash("sha256").update(`${labelNorm}|${type}|${hash}`).digest("hex");
}
