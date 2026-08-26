import { describe, expect, it } from "vitest";
import {
  DISTILLED_PAGE_FIELD_CAP,
  DistilledPageSchema,
} from "../src/index.ts";

const sample = {
  title: "Software Engineer — Application",
  step: "2/4",
  fields: [
    {
      id: "f1",
      type: "text" as const,
      required: true,
      label: "First Name",
      name: "first_name",
    },
    {
      id: "f2",
      type: "select" as const,
      required: true,
      label: "Work authorization",
      options: ["Yes, authorized", "No, need sponsorship"],
    },
  ],
  buttons: ["Back", "Continue", "Save draft"],
  errors: [],
};

describe("DistilledPageSchema", () => {
  it("accepts a compact distilled page", () => {
    expect(DistilledPageSchema.parse(sample)).toEqual(sample);
  });

  it("rejects a raw HTML string", () => {
    expect(() => DistilledPageSchema.parse("<html><body>form</body></html>")).toThrow();
  });

  it("rejects more than the field cap", () => {
    const fields = Array.from({ length: DISTILLED_PAGE_FIELD_CAP + 1 }, (_, i) => ({
      id: `f${i}`,
      type: "text" as const,
      required: false,
      label: `Field ${i}`,
    }));
    expect(() => DistilledPageSchema.parse({ ...sample, fields })).toThrow();
  });
});
