import { HIGH_CONFIDENCE_LABEL_SOURCES, type LabelSource, type Selector, type SelectorSpec } from "./field.ts";

const NTH_CHILD_RE = /:nth-(?:child|of-type|last-child|last-of-type)\b/i;

export function isNthChildSelector(value: string): boolean {
  return NTH_CHILD_RE.test(value);
}

export type SelectorFacts = {
  labelRaw: string;
  labelSource: LabelSource;
  role: string | null;
  name: string | null;
  id: string | null;
  testid: string | null;
  dataQa: string | null;
  dataAutomationId: string | null;
  placeholder: string | null;
  css: string | null;
};

function pushUnique(list: Selector[], next: Selector): void {
  if (list.some((item) => item.strategy === next.strategy && item.value === next.value)) {
    return;
  }
  if (next.strategy === "css" && isNthChildSelector(next.value)) {
    return;
  }
  list.push(next);
}

export function cssAttributeSelector(attribute: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[${attribute}="${escaped}"]`;
}

export function buildSelectorSpec(facts: SelectorFacts): SelectorSpec {
  const candidates: Selector[] = [];
  const highConfidence = HIGH_CONFIDENCE_LABEL_SOURCES.includes(facts.labelSource);

  if (highConfidence && facts.labelRaw.length > 0) {
    pushUnique(candidates, { strategy: "label", value: facts.labelRaw });
  }
  if (facts.role && facts.labelRaw.length > 0 && highConfidence) {
    pushUnique(candidates, { strategy: "role", value: `${facts.role}:${facts.labelRaw}` });
  }
  if (facts.testid) {
    pushUnique(candidates, { strategy: "testid", value: facts.testid });
  }
  if (facts.dataQa) {
    pushUnique(candidates, { strategy: "testid", value: `qa:${facts.dataQa}` });
  }
  if (facts.dataAutomationId) {
    pushUnique(candidates, { strategy: "testid", value: `automation:${facts.dataAutomationId}` });
  }
  if (facts.name) {
    pushUnique(candidates, { strategy: "name", value: facts.name });
  }
  if (facts.placeholder) {
    pushUnique(candidates, { strategy: "placeholder", value: facts.placeholder });
  }
  if (facts.id) {
    pushUnique(candidates, { strategy: "css", value: `#${cssEscapeId(facts.id)}` });
  }
  if (facts.dataAutomationId) {
    pushUnique(candidates, { strategy: "css", value: cssAttributeSelector("data-automation-id", facts.dataAutomationId) });
  }
  if (facts.testid) {
    pushUnique(candidates, { strategy: "css", value: cssAttributeSelector("data-testid", facts.testid) });
  }
  if (facts.dataQa) {
    pushUnique(candidates, { strategy: "css", value: cssAttributeSelector("data-qa", facts.dataQa) });
  }
  if (facts.name) {
    pushUnique(candidates, { strategy: "css", value: cssAttributeSelector("name", facts.name) });
  }
  if (facts.css && !isNthChildSelector(facts.css)) {
    pushUnique(candidates, { strategy: "css", value: facts.css });
  }

  const primary = candidates[0] ?? { strategy: "css" as const, value: "input, textarea, select" };
  if (isNthChildSelector(primary.value)) {
    throw new Error("nth-child selector cannot be primary");
  }
  return { primary, fallbacks: candidates.slice(1) };
}

function cssEscapeId(id: string): string {
  return id.replace(/([^\w-])/g, "\\$1");
}
