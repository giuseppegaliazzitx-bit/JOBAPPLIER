import { describe, expect, it } from "vitest";
import { classifyMailWithModel, createAiHandle, type AiCaller } from "../src/index.ts";

describe("classifyMailWithModel", () => {
  it("refuses raw HTML and accepts a kind for plain text", async () => {
    const caller: AiCaller = async () => ({
      text: JSON.stringify({ kind: "rejection" }),
      inTokens: 8,
      outTokens: 4,
    });
    const handle = createAiHandle({ caller });
    await expect(
      classifyMailWithModel(handle, {
        id: "m1",
        from: "hr@acme.com",
        subject: "Update",
        text: "<html>we regret</html>",
        occurredAt: "2026-08-27T00:00:00.000Z",
      }),
    ).rejects.toThrow(/raw HTML/);

    const kind = await classifyMailWithModel(handle, {
      id: "m2",
      from: "hr@acme.com",
      subject: "Update on your candidacy",
      text: "A brief note about next steps for the role.",
      occurredAt: "2026-08-27T00:00:00.000Z",
    });
    expect(kind).toBe("rejection");
  });
});
