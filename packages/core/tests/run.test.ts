import { describe, expect, it } from "vitest";
import { MAX_WIZARD_STEPS, PreflightSchema, RunCheckpointSchema } from "../src/index.ts";

describe("run schemas", () => {
  it("caps wizard steps and parses a checkpoint", () => {
    expect(MAX_WIZARD_STEPS).toBe(8);
    const checkpoint = RunCheckpointSchema.parse({
      url: "http://127.0.0.1:8790/apply/step/2",
      kind: "form",
      step: 1,
      history: [],
    });
    expect(checkpoint.step).toBe(1);
    const preflight = PreflightSchema.parse({
      runId: "r1",
      url: "http://127.0.0.1:8790/apply/step/4",
      title: "Review",
      rows: [
        {
          fingerprint: "fp",
          labelRaw: "First Name",
          value: "Ada",
          source: "test",
          confidence: 1,
          status: "resolved",
          readBack: "Ada",
          verified: true,
        },
      ],
      ready: true,
    });
    expect(preflight.ready).toBe(true);
  });
});
