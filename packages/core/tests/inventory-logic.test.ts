import { describe, expect, it } from "vitest";
import { fieldFingerprint, normalizeLabel } from "../src/fingerprint.ts";
import { humanizeIdent, resolveLabel } from "../src/label-ladder.ts";
import { buildSelectorSpec, isNthChildSelector } from "../src/selectors.ts";
import { classifyWidget } from "../src/widget.ts";

describe("normalizeLabel", () => {
  it("strips required markers and punctuation", () => {
    expect(normalizeLabel("First Name *")).toBe("first name");
    expect(normalizeLabel("Email (required)")).toBe("email");
  });
});

describe("fieldFingerprint", () => {
  it("is sha256 of labelNorm | type | optionsHash", () => {
    const a = fieldFingerprint("work authorization", "select", [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ]);
    const b = fieldFingerprint("work authorization", "select", [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
    ]);
    const c = fieldFingerprint("work authorization", "text", [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("resolveLabel ladder", () => {
  it("stops at the first non-empty step", () => {
    expect(
      resolveLabel({
        labelFor: "First Name",
        wrappingLabel: "Wrapped",
        ariaLabelledby: "Aria by",
        ariaLabel: "Aria",
        precedingSibling: "Prev",
        placeholder: "Type here",
        name: "first_name",
        id: "fn",
      }),
    ).toEqual({ labelRaw: "First Name", labelSource: "label_for" });

    expect(
      resolveLabel({
        labelFor: null,
        wrappingLabel: "I agree to the terms",
        ariaLabelledby: null,
        ariaLabel: null,
        precedingSibling: null,
        placeholder: null,
        name: null,
        id: null,
      }),
    ).toEqual({ labelRaw: "I agree to the terms", labelSource: "wrapping_label" });

    expect(
      resolveLabel({
        labelFor: null,
        wrappingLabel: null,
        ariaLabelledby: "Full legal name",
        ariaLabel: "ignored",
        precedingSibling: null,
        placeholder: null,
        name: null,
        id: null,
      }),
    ).toEqual({ labelRaw: "Full legal name", labelSource: "aria_labelledby" });

    expect(
      resolveLabel({
        labelFor: null,
        wrappingLabel: null,
        ariaLabelledby: null,
        ariaLabel: "Location",
        precedingSibling: null,
        placeholder: "Search",
        name: null,
        id: null,
      }),
    ).toEqual({ labelRaw: "Location", labelSource: "aria_label" });

    expect(
      resolveLabel({
        labelFor: null,
        wrappingLabel: null,
        ariaLabelledby: null,
        ariaLabel: null,
        precedingSibling: "Country",
        placeholder: "Pick one",
        name: "country",
        id: null,
      }),
    ).toEqual({ labelRaw: "Country", labelSource: "preceding_sibling" });

    expect(
      resolveLabel({
        labelFor: null,
        wrappingLabel: null,
        ariaLabelledby: null,
        ariaLabel: null,
        precedingSibling: null,
        placeholder: "Search locations",
        name: "q",
        id: null,
      }),
    ).toEqual({ labelRaw: "Search locations", labelSource: "placeholder" });

    expect(
      resolveLabel({
        labelFor: null,
        wrappingLabel: null,
        ariaLabelledby: null,
        ariaLabel: null,
        precedingSibling: null,
        placeholder: null,
        name: "job_application[first_name]",
        id: "x",
      }),
    ).toEqual({ labelRaw: "first name", labelSource: "humanized_name" });
  });
});

describe("humanizeIdent", () => {
  it("turns first_name and greenhouse names into words", () => {
    expect(humanizeIdent("first_name")).toBe("first name");
    expect(humanizeIdent("job_application[first_name]")).toBe("first name");
  });
});

describe("buildSelectorSpec", () => {
  it("never emits an nth-child chain as primary", () => {
    const spec = buildSelectorSpec({
      labelRaw: "First Name",
      labelSource: "label_for",
      role: "textbox",
      name: "first_name",
      id: "fn",
      testid: "first-name",
      dataQa: null,
      dataAutomationId: "legalName",
      placeholder: null,
      css: "form > div:nth-child(3) > input:nth-child(1)",
    });
    expect(isNthChildSelector(spec.primary.value)).toBe(false);
    expect(spec.primary).toEqual({ strategy: "label", value: "First Name" });
    for (const fallback of spec.fallbacks) {
      expect(isNthChildSelector(fallback.value)).toBe(false);
    }
  });

  it("does not use a low-confidence label as primary", () => {
    const spec = buildSelectorSpec({
      labelRaw: "first name",
      labelSource: "humanized_name",
      role: "textbox",
      name: "first_name",
      id: null,
      testid: null,
      dataQa: null,
      dataAutomationId: null,
      placeholder: null,
      css: null,
    });
    expect(spec.primary).toEqual({ strategy: "name", value: "first_name" });
  });
});

describe("classifyWidget", () => {
  it("classifies native, combobox, typeahead, react-select, and rich-text", () => {
    expect(
      classifyWidget({
        tag: "input",
        inputType: "email",
        role: null,
        ariaHaspopup: null,
        ariaAutocomplete: null,
        contentEditable: false,
        className: "",
        multiple: false,
        grouped: false,
      }),
    ).toEqual({ type: "email", widget: "native" });

    expect(
      classifyWidget({
        tag: "input",
        inputType: "text",
        role: "combobox",
        ariaHaspopup: "listbox",
        ariaAutocomplete: null,
        contentEditable: false,
        className: "",
        multiple: false,
        grouped: false,
      }),
    ).toEqual({ type: "custom", widget: "combobox" });

    expect(
      classifyWidget({
        tag: "input",
        inputType: "text",
        role: "combobox",
        ariaHaspopup: "listbox",
        ariaAutocomplete: "list",
        contentEditable: false,
        className: "",
        multiple: false,
        grouped: false,
      }),
    ).toEqual({ type: "custom", widget: "typeahead" });

    expect(
      classifyWidget({
        tag: "div",
        inputType: null,
        role: "combobox",
        ariaHaspopup: "listbox",
        ariaAutocomplete: null,
        contentEditable: false,
        className: "react-select__control",
        multiple: false,
        grouped: false,
      }).widget,
    ).toBe("react-select");

    expect(
      classifyWidget({
        tag: "div",
        inputType: null,
        role: "textbox",
        ariaHaspopup: null,
        ariaAutocomplete: null,
        contentEditable: true,
        className: "ql-editor",
        multiple: false,
        grouped: false,
      }),
    ).toEqual({ type: "custom", widget: "rich-text" });
  });
});
