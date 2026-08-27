import { describe, expect, it } from "vitest";
import { mapOption } from "../src/option-map.ts";

const OPTIONS = [
  { value: "yes_any", label: "Yes, I am authorized to work in the US for any employer" },
  { value: "no_sponsor", label: "No, I require sponsorship now or in the future" },
];

describe("mapOption", () => {
  it("matches exact then case-insensitive then unique contained token", async () => {
    const exact = await mapOption("yes_any", OPTIONS);
    expect(exact.status).toBe("mapped");
    if (exact.status === "mapped") {
      expect(exact.step).toBe(1);
    }

    const insensitive = await mapOption("YES_ANY", OPTIONS);
    expect(insensitive.status).toBe("mapped");
    if (insensitive.status === "mapped") {
      expect(insensitive.step).toBe(2);
    }

    const contained = await mapOption("Yes", OPTIONS);
    expect(contained.status).toBe("mapped");
    if (contained.status === "mapped") {
      expect(contained.option.value).toBe("yes_any");
      expect(contained.step).toBe(3);
    }
  });

  it("uses embeddings when the gap is clear, otherwise leaves unmapped", async () => {
    const embed = (text: string) => {
      if (text.toLowerCase().includes("yes") || text.toLowerCase().includes("authorized")) {
        return [1, 0];
      }
      if (text.toLowerCase().includes("no") || text.toLowerCase().includes("sponsor")) {
        return [0, 1];
      }
      return [0.5, 0.5];
    };
    const mapped = await mapOption("authorized for any employer", OPTIONS, embed);
    expect(mapped.status).toBe("mapped");
    if (mapped.status === "mapped") {
      expect(mapped.step).toBe(4);
      expect(mapped.option.value).toBe("yes_any");
    }

    const unclear = await mapOption("maybe", OPTIONS, () => [0.7, 0.7]);
    expect(unclear.status).toBe("unmapped");
  });

  it("stores a user pick as an alias for that option set", async () => {
    const hash = "optset1";
    const mapped = await mapOption("y", OPTIONS, undefined, [
      { optionsHash: hash, canonicalValue: "y", chosenOption: "yes_any" },
    ], hash);
    expect(mapped.status).toBe("mapped");
    if (mapped.status === "mapped") {
      expect(mapped.option.value).toBe("yes_any");
    }
  });
});
