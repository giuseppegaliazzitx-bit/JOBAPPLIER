import { collapseWs } from "./normalize.ts";
import type { LabelSource } from "./field.ts";

export type LabelFacts = {
  labelFor: string | null;
  wrappingLabel: string | null;
  ariaLabelledby: string | null;
  ariaLabel: string | null;
  precedingSibling: string | null;
  placeholder: string | null;
  name: string | null;
  id: string | null;
};

export type ResolvedLabel = {
  labelRaw: string;
  labelSource: LabelSource;
};

function nonempty(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = collapseWs(value);
  return trimmed.length > 0 ? trimmed : null;
}

export function humanizeIdent(raw: string): string {
  const brackets = raw.match(/\[([^\]]+)\]/g);
  const core = brackets && brackets.length > 0 ? (brackets[brackets.length - 1] ?? raw) : raw;
  const ident = core.replace(/^\[/, "").replace(/\]$/, "");
  return collapseWs(
    ident
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_\-.]+/g, " ")
      .replace(/\d+/g, " ")
      .toLowerCase(),
  );
}

export function resolveLabel(facts: LabelFacts): ResolvedLabel {
  const steps: Array<[LabelSource, string | null]> = [
    ["label_for", nonempty(facts.labelFor)],
    ["wrapping_label", nonempty(facts.wrappingLabel)],
    ["aria_labelledby", nonempty(facts.ariaLabelledby)],
    ["aria_label", nonempty(facts.ariaLabel)],
    ["preceding_sibling", nonempty(facts.precedingSibling)],
    ["placeholder", nonempty(facts.placeholder)],
  ];
  for (const [source, value] of steps) {
    if (value) {
      return { labelRaw: value, labelSource: source };
    }
  }
  const fromName = facts.name ? nonempty(humanizeIdent(facts.name)) : null;
  const fromId = facts.id ? nonempty(humanizeIdent(facts.id)) : null;
  const humanized = fromName ?? fromId;
  if (humanized) {
    return { labelRaw: humanized, labelSource: "humanized_name" };
  }
  return { labelRaw: "", labelSource: "unresolved" };
}
