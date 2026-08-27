import {
  FieldDescriptorSchema,
  FieldInventorySchema,
  buildSelectorSpec,
  classifyWidget,
  fieldFingerprint,
  normalizeLabel,
  resolveLabel,
  type FieldDescriptor,
  type FieldInventory,
  type FieldType,
  type WidgetKind,
} from "@autoapply/core";
import type { Page } from "playwright";
import type { RawControl } from "./raw-control.ts";
import { scrapeDom } from "./scrape-dom.ts";

function roleFor(type: FieldType, widget: WidgetKind): string | null {
  if (widget === "combobox" || widget === "typeahead" || widget === "react-select") {
    return "combobox";
  }
  if (type === "select" || type === "multiselect") {
    return "combobox";
  }
  if (type === "checkbox" || type === "checkbox_group") {
    return "checkbox";
  }
  if (type === "radio") {
    return "radio";
  }
  if (type === "file" || type === "custom") {
    return null;
  }
  return "textbox";
}

export function inventoryFromRaw(title: string, raw: RawControl[]): FieldInventory {
  const fields: FieldDescriptor[] = raw.map((control) => {
    const label = resolveLabel(control);
    const classified = classifyWidget(control);
    const options = control.options.length > 0 ? control.options : undefined;
    const selector = buildSelectorSpec({
      labelRaw: label.labelRaw,
      labelSource: label.labelSource,
      role: roleFor(classified.type, classified.widget),
      name: control.name,
      id: control.id,
      testid: control.testid,
      dataQa: control.dataQa,
      dataAutomationId: control.dataAutomationId,
      placeholder: control.placeholder,
      css: control.css,
    });
    return FieldDescriptorSchema.parse({
      fingerprint: fieldFingerprint(normalizeLabel(label.labelRaw), classified.type, options),
      labelRaw: label.labelRaw,
      labelNorm: normalizeLabel(label.labelRaw),
      labelSource: label.labelSource,
      helpText: control.helpText ?? undefined,
      type: classified.type,
      widget: classified.widget,
      required: control.required,
      options,
      selector,
      containerPath: control.containerPath,
      visible: control.visible,
      disabled: control.disabled,
      currentValue: control.currentValue.length > 0 ? control.currentValue : undefined,
      sectionHeading: control.sectionHeading ?? undefined,
    });
  });
  return FieldInventorySchema.parse({ title, fields });
}

export async function extractFieldInventory(page: Page): Promise<FieldInventory> {
  const title = await page.title();
  const raw = await page.evaluate(scrapeDom);
  return inventoryFromRaw(title, raw);
}
