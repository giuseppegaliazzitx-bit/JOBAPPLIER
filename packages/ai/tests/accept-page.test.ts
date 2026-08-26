import { DistilledPageSchema, type DistilledPage } from "@autoapply/core";
import { describe, expect, it } from "vitest";
import { acceptPage } from "../src/index.ts";

const page: DistilledPage = {
  title: "Application",
  fields: [
    { id: "f1", type: "text", required: true, label: "First Name" },
  ],
  buttons: ["Continue"],
  errors: [],
};

describe("acceptPage", () => {
  it("returns a DistilledPage", () => {
    expect(acceptPage(page)).toEqual(page);
  });

  it("refuses raw HTML", () => {
    const html = "<form><input name='first_name'></form>";
    expect(() => DistilledPageSchema.parse(html)).toThrow();
    expect(() => acceptPage(html as unknown as DistilledPage)).toThrow();
  });
});
