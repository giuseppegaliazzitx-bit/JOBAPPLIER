import type { FieldType, WidgetKind } from "./field.ts";

export type WidgetFacts = {
  tag: string;
  inputType: string | null;
  role: string | null;
  ariaHaspopup: string | null;
  ariaAutocomplete: string | null;
  contentEditable: boolean;
  className: string;
  multiple: boolean;
  grouped: boolean;
};

export type ClassifiedControl = {
  type: FieldType;
  widget: WidgetKind;
};

export function classifyWidget(facts: WidgetFacts): ClassifiedControl {
  const tag = facts.tag.toLowerCase();
  const inputType = (facts.inputType ?? "").toLowerCase();
  const role = (facts.role ?? "").toLowerCase();
  const className = facts.className.toLowerCase();

  if (facts.contentEditable || className.includes("ql-editor") || className.includes("tox-edit")) {
    return { type: "custom", widget: "rich-text" };
  }
  if (
    className.includes("react-select") ||
    (className.includes("-control") && className.includes("css-"))
  ) {
    return { type: "custom", widget: "react-select" };
  }
  if (role === "combobox" || facts.ariaHaspopup === "listbox") {
    if (facts.ariaAutocomplete === "list" || facts.ariaAutocomplete === "both") {
      return { type: "custom", widget: "typeahead" };
    }
    return { type: "custom", widget: "combobox" };
  }
  if (tag === "select") {
    return { type: facts.multiple ? "multiselect" : "select", widget: "native" };
  }
  if (tag === "textarea") {
    return { type: "textarea", widget: "native" };
  }
  if (tag === "input") {
    if (inputType === "file") return { type: "file", widget: "native" };
    if (inputType === "checkbox") {
      return { type: facts.grouped ? "checkbox_group" : "checkbox", widget: "native" };
    }
    if (inputType === "radio") return { type: "radio", widget: "native" };
    if (inputType === "email") return { type: "email", widget: "native" };
    if (inputType === "tel") return { type: "tel", widget: "native" };
    if (inputType === "url") return { type: "url", widget: "native" };
    if (inputType === "number") return { type: "number", widget: "native" };
    if (inputType === "date" || inputType === "datetime-local") return { type: "date", widget: "native" };
    return { type: "text", widget: "native" };
  }
  return { type: "custom", widget: "unknown" };
}
