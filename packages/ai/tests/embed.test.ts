import { describe, expect, it } from "vitest";
import { blobToEmbedding, embeddingToBlob } from "../src/embed.ts";

describe("embedding blob round-trip", () => {
  it("preserves Float32 values", () => {
    const original = Float32Array.from([0.1, -0.25, 0.5, 1]);
    const blob = embeddingToBlob(original);
    const restored = blobToEmbedding(blob);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });
});
