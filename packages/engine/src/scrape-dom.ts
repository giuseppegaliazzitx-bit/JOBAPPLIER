import type { RawControl, RawOption } from "./raw-control.ts";

export function scrapeDom(): RawControl[] {
  const skipInputTypes = new Set(["hidden", "submit", "button", "reset", "image"]);
  function textOf(el: Element | null): string {
    if (!el) {
      return "";
    }
    return (el.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  function attr(el: Element, name: string): string | null {
    const value = el.getAttribute(name);
    return value && value.trim().length > 0 ? value.trim() : null;
  }

  function containsOtherControl(root: Element, self: Element): boolean {
    const controls = root.querySelectorAll("input, textarea, select, [contenteditable='true'], [role='combobox']");
    for (const control of controls) {
      if (control !== self && !self.contains(control)) {
        return true;
      }
    }
    return false;
  }

  function wrappingLabelText(el: Element): string | null {
    const label = el.closest("label");
    if (!label) {
      return null;
    }
    const clone = label.cloneNode(true) as Element;
    for (const nested of clone.querySelectorAll("input, textarea, select")) {
      nested.remove();
    }
    const text = textOf(clone);
    return text.length > 0 ? text : null;
  }

  function labelForText(el: Element): string | null {
    const id = el.getAttribute("id");
    if (!id) {
      return null;
    }
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    const label = document.querySelector(`label[for="${escaped}"]`);
    const text = textOf(label);
    return text.length > 0 ? text : null;
  }

  function labelledByText(el: Element): string | null {
    const ids = el.getAttribute("aria-labelledby");
    if (!ids) {
      return null;
    }
    const parts: string[] = [];
    for (const id of ids.split(/\s+/)) {
      const ref = document.getElementById(id);
      const text = textOf(ref);
      if (text.length > 0) {
        parts.push(text);
      }
    }
    return parts.length > 0 ? parts.join(" ") : null;
  }

  function precedingSiblingText(el: Element): string | null {
    let node: Element | null = el;
    for (let depth = 0; depth < 3; depth += 1) {
      if (!node) {
        break;
      }
      const parent: Element | null = node.parentElement;
      if (!parent) {
        break;
      }
      let textBefore = "";
      const children: ChildNode[] = Array.from(parent.childNodes);
      for (const child of children) {
        if (child === node) {
          break;
        }
        if (child.nodeType === 3) {
          textBefore += child.textContent ?? "";
        }
      }
      const trimmedText = textBefore.replace(/\s+/g, " ").trim();
      if (trimmedText.length > 0) {
        return trimmedText;
      }
      let sib: Element | null = node.previousElementSibling;
      while (sib) {
        if (!containsOtherControl(sib, el)) {
          const text = textOf(sib);
          if (text.length > 0) {
            return text;
          }
        }
        sib = sib.previousElementSibling;
      }
      node = parent;
    }
    return null;
  }

  function groupCaption(el: Element): string | null {
    const fieldset = el.closest("fieldset");
    if (!fieldset) {
      return null;
    }
    const legend = fieldset.querySelector(":scope > legend");
    const text = textOf(legend);
    return text.length > 0 ? text : null;
  }

  function sectionHeading(el: Element): string | null {
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector(":scope > legend");
      const legendText = textOf(legend);
      if (legendText.length > 0) {
        return legendText;
      }
    }
    let node: Element | null = el;
    for (let depth = 0; depth < 8; depth += 1) {
      if (!node) {
        break;
      }
      const parent: Element | null = node.parentElement;
      if (!parent) {
        break;
      }
      let sib: Element | null = node.previousElementSibling;
      while (sib) {
        if (/^H[1-6]$/.test(sib.tagName) || sib.getAttribute("role") === "heading") {
          const text = textOf(sib);
          if (text.length > 0) {
            return text;
          }
        }
        sib = sib.previousElementSibling;
      }
      node = parent;
    }
    return null;
  }

  function helpText(el: Element): string | null {
    const described = el.getAttribute("aria-describedby");
    if (described) {
      const ref = document.getElementById(described);
      const text = textOf(ref);
      if (text.length > 0) {
        return text;
      }
    }
    return null;
  }

  function containerPath(el: Element): string {
    const parts: string[] = [];
    let node: Element | null = el.parentElement;
    for (let i = 0; i < 5 && node && node !== document.body; i += 1) {
      const tag = node.tagName.toLowerCase();
      const id = node.getAttribute("id");
      const automation = node.getAttribute("data-automation-id");
      const name = node.getAttribute("name");
      let piece = tag;
      if (id) {
        piece += `#${id}`;
      } else if (automation) {
        piece += `[data-automation-id="${automation}"]`;
      } else if (name) {
        piece += `[name="${name}"]`;
      }
      parts.unshift(piece);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function cssHint(el: Element): string | null {
    const automation = attr(el, "data-automation-id");
    if (automation) {
      return `[data-automation-id="${automation.replace(/"/g, '\\"')}"]`;
    }
    const testid = attr(el, "data-testid");
    if (testid) {
      return `[data-testid="${testid.replace(/"/g, '\\"')}"]`;
    }
    const id = attr(el, "id");
    if (id) {
      return `#${id}`;
    }
    const name = attr(el, "name");
    if (name) {
      return `[name="${name.replace(/"/g, '\\"')}"]`;
    }
    return null;
  }

  function isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function optionLabel(input: HTMLInputElement): string {
    const wrap = input.closest("label");
    if (wrap) {
      const clone = wrap.cloneNode(true) as Element;
      for (const nested of clone.querySelectorAll("input")) {
        nested.remove();
      }
      const text = textOf(clone);
      if (text.length > 0) {
        return text;
      }
    }
    const id = input.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      const text = textOf(label);
      if (text.length > 0) {
        return text;
      }
    }
    return input.value || "";
  }

  function baseFrom(el: Element, extras: Partial<RawControl>): RawControl {
    const input = el as HTMLInputElement;
    return {
      labelFor: labelForText(el),
      wrappingLabel: wrappingLabelText(el),
      ariaLabelledby: labelledByText(el),
      ariaLabel: attr(el, "aria-label"),
      precedingSibling: precedingSiblingText(el),
      placeholder: attr(el, "placeholder"),
      name: attr(el, "name"),
      id: attr(el, "id"),
      tag: el.tagName.toLowerCase(),
      inputType: el.tagName.toLowerCase() === "input" ? input.type || "text" : null,
      role: attr(el, "role"),
      ariaHaspopup: attr(el, "aria-haspopup"),
      ariaAutocomplete: attr(el, "aria-autocomplete"),
      contentEditable: el.getAttribute("contenteditable") === "true",
      className: typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className : "",
      multiple: Boolean((el as HTMLSelectElement).multiple),
      grouped: false,
      required: Boolean((el as HTMLInputElement).required) || el.getAttribute("aria-required") === "true",
      disabled: Boolean((el as HTMLInputElement).disabled),
      visible: isVisible(el),
      currentValue: "",
      options: [],
      testid: attr(el, "data-testid"),
      dataQa: attr(el, "data-qa"),
      dataAutomationId: attr(el, "data-automation-id"),
      helpText: helpText(el),
      sectionHeading: sectionHeading(el),
      containerPath: containerPath(el),
      css: cssHint(el),
      ...extras,
    };
  }

  const seen = new Set<Element>();
  const out: RawControl[] = [];

  function mark(el: Element): void {
    seen.add(el);
  }

  const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
  const radiosByName = new Map<string, HTMLInputElement[]>();
  for (const radio of radios) {
    const name = radio.getAttribute("name") || `__anon_${out.length}`;
    const group = radiosByName.get(name) ?? [];
    group.push(radio as HTMLInputElement);
    radiosByName.set(name, group);
  }
  for (const group of radiosByName.values()) {
    const first = group[0];
    if (!first) {
      continue;
    }
    for (const radio of group) {
      mark(radio);
    }
    const options: RawOption[] = group.map((radio) => ({
      value: radio.value,
      label: optionLabel(radio),
    }));
    const caption = groupCaption(first);
    out.push(
      baseFrom(first, {
        ...(caption ? { labelFor: null, wrappingLabel: caption } : {}),
        grouped: true,
        inputType: "radio",
        options,
        currentValue: group.find((radio) => radio.checked)?.value ?? "",
        required: group.some((radio) => radio.required),
      }),
    );
  }

  const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  const checksByName = new Map<string, HTMLInputElement[]>();
  for (const box of checkboxes) {
    const name = box.getAttribute("name");
    if (!name) {
      continue;
    }
    const group = checksByName.get(name) ?? [];
    group.push(box as HTMLInputElement);
    checksByName.set(name, group);
  }
  for (const group of checksByName.values()) {
    if (group.length < 2) {
      continue;
    }
    const first = group[0];
    if (!first) {
      continue;
    }
    for (const box of group) {
      mark(box);
    }
    const caption = groupCaption(first);
    out.push(
      baseFrom(first, {
        ...(caption ? { labelFor: null, wrappingLabel: caption } : {}),
        grouped: true,
        inputType: "checkbox",
        options: group.map((box) => ({ value: box.value || optionLabel(box), label: optionLabel(box) })),
        currentValue: group
          .filter((box) => box.checked)
          .map((box) => box.value)
          .join(","),
      }),
    );
  }

  const natives = Array.from(document.querySelectorAll("input, textarea, select"));
  for (const el of natives) {
    if (seen.has(el)) {
      continue;
    }
    const input = el as HTMLInputElement;
    if (el.tagName.toLowerCase() === "input" && skipInputTypes.has((input.type || "").toLowerCase())) {
      continue;
    }
    mark(el);
    let options: RawOption[] = [];
    if (el.tagName.toLowerCase() === "select") {
      options = Array.from((el as HTMLSelectElement).options).map((option) => ({
        value: option.value,
        label: (option.textContent ?? "").trim(),
      }));
    }
    out.push(
      baseFrom(el, {
        options,
        currentValue: input.value ?? "",
      }),
    );
  }

  const extras = Array.from(
    document.querySelectorAll('[contenteditable="true"], [role="combobox"], [data-custom-field]'),
  );
  for (const el of extras) {
    if (seen.has(el)) {
      continue;
    }
    if ([...seen].some((item) => item.contains(el) || el.contains(item))) {
      continue;
    }
    mark(el);
    out.push(
      baseFrom(el, {
        currentValue: textOf(el),
      }),
    );
  }

  return out;
}
