import { describe, expect, it } from "vitest";
import {
  DISTILLED_PAGE_BYTE_CAP,
  DISTILLED_PAGE_FIELD_CAP,
  assertDistilledSafe,
  inventoryToDistilled,
  paginateDistilled,
  renderDistilledPage,
  scrubPii,
  type DistilledPage,
  type FieldInventory,
} from "../src/index.ts";

function page(fields: DistilledPage["fields"]): DistilledPage {
  return { title: "Application", fields, buttons: ["Continue"], errors: [] };
}

describe("distiller", () => {
  it("strips current values and scrubs PII from labels", () => {
    const inventory: FieldInventory = {
      title: "Software Engineer — Application",
      fields: [
        {
          fingerprint: "a",
          labelRaw: "Email ada@example.com",
          labelNorm: "email",
          labelSource: "label_for",
          type: "email",
          widget: "native",
          required: true,
          selector: { primary: { strategy: "name", value: "email" }, fallbacks: [] },
          containerPath: "form",
          visible: true,
          disabled: false,
          currentValue: "ada@example.com",
        },
      ],
    };
    const distilled = inventoryToDistilled(inventory);
    expect(distilled.fields[0]?.label).toContain("Email");
    const rendered = renderDistilledPage(distilled);
    expect(rendered).not.toContain("ada@example.com");
    expect(rendered).toContain("[redacted-email]");
    expect(rendered).not.toMatch(/value=/);
    expect(scrubPii("call 555-010-9999")).toContain("[redacted-phone]");
  });

  it("paginates at 60 fields and 8KB", () => {
    const fields = Array.from({ length: DISTILLED_PAGE_FIELD_CAP + 5 }, (_, i) => ({
      id: `f${i}`,
      type: "text" as const,
      required: false,
      label: `Field ${i} ${"x".repeat(20)}`,
    }));
    const pages = paginateDistilled(page(fields));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((item) => item.fields.length <= DISTILLED_PAGE_FIELD_CAP)).toBe(true);
    expect(pages.every((item) => Buffer.byteLength(renderDistilledPage(item), "utf8") <= DISTILLED_PAGE_BYTE_CAP)).toBe(
      true,
    );
  });

  it("never includes a profile value or raw HTML tag", () => {
    const distilled = page([
      { id: "f1", type: "text", required: true, label: "First Name", name: "first_name" },
    ]);
    expect(() =>
      assertDistilledSafe(distilled, { firstName: "Ada", email: "ada@example.com", phone: "555-0100" }),
    ).not.toThrow();
    expect(() =>
      assertDistilledSafe(
        { ...distilled, fields: [{ id: "f1", type: "text", required: true, label: "<input name=x>" }] },
        {},
      ),
    ).toThrow(/HTML tag/);
  });
});
