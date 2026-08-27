import {
  parameterizeValue,
  type DocumentLiteral,
  type ProfileValues,
  type SelectorSpec,
  type Step,
} from "@autoapply/core";
import type { CDPSession, Page } from "playwright";

export type RawRecordEvent = {
  kind: "navigate" | "click" | "fill" | "select" | "upload";
  url?: string;
  strategy?: string;
  selector?: string;
  name?: string;
  id?: string;
  label?: string;
  value?: string;
  tag?: string;
  text?: string;
  inputType?: string;
};

export type UnmatchedValue = {
  name: string;
  value: string;
  selector: SelectorSpec;
};

export type RecordResult = {
  steps: Step[];
  unmatched: UnmatchedValue[];
};

const INJECT = `(() => {
  if (window.__autoapplyRecorder) return;
  window.__autoapplyRecorder = true;
  function pick(el) {
    if (!el || !el.getAttribute) return null;
    const id = el.getAttribute("id");
    const name = el.getAttribute("name");
    const label = el.getAttribute("aria-label");
    const tag = (el.tagName || "").toLowerCase();
    const inputType = (el.type || "").toLowerCase();
    const text = ((el.innerText || el.textContent || "").trim()).slice(0, 80);
    let strategy = "css";
    let selector = tag;
    if (id) { strategy = "css"; selector = "#" + id; }
    else if (name) { strategy = "name"; selector = name; }
    else if (label) { strategy = "label"; selector = label; }
    return { strategy, selector, name, id, label, tag, text, inputType };
  }
  function emit(payload) {
    if (typeof window.autoapplyRecord === "function") {
      window.autoapplyRecord(JSON.stringify(payload));
    }
  }
  document.addEventListener("click", function (event) {
    const el = event.target;
    if (!el || !el.closest) return;
    const payload = pick(el.closest("button, a, [role=button], [role=option], input, select, label") || el);
    if (!payload) return;
    emit({ kind: "click", ...payload });
  }, true);
  document.addEventListener("change", function (event) {
    const el = event.target;
    if (!el || !el.getAttribute) return;
    const payload = pick(el);
    if (!payload) return;
    if ((el.type || "").toLowerCase() === "file") {
      const file = el.files && el.files[0] ? el.files[0].name : "";
      emit({ kind: "upload", ...payload, value: file });
      return;
    }
    if ((el.tagName || "").toLowerCase() === "select") {
      emit({ kind: "select", ...payload, value: el.value });
      return;
    }
    emit({ kind: "fill", ...payload, value: el.value });
  }, true);
})();`;

function specFromEvent(event: RawRecordEvent): SelectorSpec {
  if (event.id) {
    return {
      primary: { strategy: "css", value: `#${event.id}` },
      fallbacks: event.name ? [{ strategy: "name", value: event.name }] : [],
    };
  }
  if (event.name) {
    return { primary: { strategy: "name", value: event.name }, fallbacks: [] };
  }
  if (event.label) {
    return { primary: { strategy: "label", value: event.label }, fallbacks: [] };
  }
  if (event.strategy && event.selector) {
    const strategy = event.strategy as SelectorSpec["primary"]["strategy"];
    return { primary: { strategy, value: event.selector }, fallbacks: [] };
  }
  return { primary: { strategy: "text", value: event.text || "unknown" }, fallbacks: [] };
}

function selectorKey(event: RawRecordEvent): string {
  return event.id ?? event.name ?? event.selector ?? event.text ?? "";
}

export function postProcessRecording(
  events: RawRecordEvent[],
  profile: ProfileValues,
  documents: DocumentLiteral[] = [],
): RecordResult {
  const collapsed: RawRecordEvent[] = [];
  for (const event of events) {
    if (event.kind === "navigate") {
      if (!event.url || event.url === "about:blank") continue;
      const prev = collapsed[collapsed.length - 1];
      if (prev?.kind === "navigate" && prev.url === event.url) continue;
      collapsed.push(event);
      continue;
    }
    if (event.kind === "fill" || event.kind === "select" || event.kind === "upload") {
      const key = selectorKey(event);
      const idx = collapsed.findIndex((item) => item.kind === event.kind && selectorKey(item) === key);
      if (idx >= 0) {
        collapsed[idx] = event;
      } else {
        collapsed.push(event);
      }
      continue;
    }
    collapsed.push(event);
  }

  const steps: Step[] = [];
  const unmatched: UnmatchedValue[] = [];
  let n = 0;
  let haveAdvance = false;
  const nextId = (prefix: string) => {
    n += 1;
    return `${prefix}-${n}`;
  };

  for (const event of collapsed) {
    if (event.kind === "navigate" && event.url) {
      steps.push({
        id: nextId("nav"),
        name: `Navigate`,
        type: "navigate",
        optional: true,
        onFail: "skip",
        guard: { kind: "url", value: event.url },
      });
      continue;
    }
    if (event.kind === "click") {
      const text = (event.text ?? "").toLowerCase();
      if (/\bcontinue\b|\bnext\b/.test(text)) {
        if (haveAdvance) continue;
        haveAdvance = true;
        steps.push({
          id: nextId("adv"),
          name: "Continue",
          type: "advance",
          selector: {
            primary: { strategy: "role", value: "button:Continue" },
            fallbacks: event.id ? [{ strategy: "css", value: `#${event.id}` }] : [],
          },
          optional: false,
          onFail: "heal",
        });
        continue;
      }
      if (/submit application|^submit$/.test(text)) {
        steps.push({
          id: nextId("sub"),
          name: "Submit application",
          type: "submit",
          selector: {
            primary: { strategy: "css", value: "#submit-application" },
            fallbacks: [{ strategy: "role", value: "button:Submit application" }],
          },
          optional: false,
          onFail: "pause",
        });
        continue;
      }
      continue;
    }
    if (event.kind === "fill" || event.kind === "select" || event.kind === "upload") {
      const selector = specFromEvent(event);
      const name = event.label || event.name || event.id || event.kind;
      const raw = event.value ?? "";
      const hit = parameterizeValue(raw, profile, documents);
      if (hit.kind === "unmatched") {
        if (raw.length > 0) {
          unmatched.push({ name, value: raw, selector });
        }
        steps.push({
          id: nextId(event.kind),
          name,
          type: event.kind === "upload" ? "upload" : event.kind === "select" ? "select" : "fill",
          selector,
          valueSource: "answer_bank",
          optional: false,
          onFail: "heal",
        });
        continue;
      }
      steps.push({
        id: nextId(event.kind),
        name,
        type: event.kind === "upload" ? "upload" : event.kind === "select" ? "select" : "fill",
        selector,
        valueSource: hit.valueSource,
        optional: false,
        onFail: "heal",
      });
    }
  }
  return { steps, unmatched };
}

export type Recorder = {
  events: RawRecordEvent[];
  stop: () => Promise<RawRecordEvent[]>;
};

export async function attachRecorder(page: Page): Promise<Recorder> {
  const events: RawRecordEvent[] = [];
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Runtime.addBinding", { name: "autoapplyRecord" });
  cdp.on("Runtime.bindingCalled", (evt: { name: string; payload: string }) => {
    if (evt.name !== "autoapplyRecord") {
      return;
    }
    try {
      const parsed = JSON.parse(evt.payload) as RawRecordEvent;
      events.push(parsed);
    } catch {
      // ignore malformed recorder payloads
    }
  });
  cdp.on("Page.frameNavigated", (evt: { frame: { url?: string; parentId?: string } }) => {
    if (evt.frame.parentId) {
      return;
    }
    if (evt.frame.url) {
      events.push({ kind: "navigate", url: evt.frame.url });
    }
  });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INJECT });
  await cdp.send("Runtime.evaluate", { expression: INJECT });
  return {
    events,
    stop: async () => {
      await cdp.detach().catch(() => undefined);
      return events;
    },
  };
}

export function classifyUnmatched(
  result: RecordResult,
  decisions: Array<{ value: string; as: "literal" | "answer_bank" | "skip" }>,
): Step[] {
  const byValue = new Map(decisions.map((item) => [item.value, item.as]));
  return result.steps
    .map((step) => {
      const unmatched = result.unmatched.find((item) => item.name === step.name);
      if (!unmatched || step.valueSource !== "answer_bank") {
        return step;
      }
      const decision = byValue.get(unmatched.value);
      if (decision === "skip") {
        return null;
      }
      if (decision === "literal") {
        return { ...step, valueSource: `literal:${unmatched.value}` };
      }
      return step;
    })
    .filter((step): step is Step => step !== null);
}
