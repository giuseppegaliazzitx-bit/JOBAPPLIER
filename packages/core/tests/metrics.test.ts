import { describe, expect, it } from "vitest";
import { computeMetrics, funnelIsMonotonic, type MetricsInput } from "../src/index.ts";

function input(overrides: Partial<MetricsInput> = {}): MetricsInput {
  return {
    jobsAdded: 5,
    applications: [
      {
        status: "applied",
        submittedAt: "2026-08-20T10:00:00.000Z",
        platform: "greenhouse",
        title: "Engineer",
        resumeVariant: "general.pdf",
        lastMailAt: null,
        statusUpdatedAt: "2026-08-20T10:00:00.000Z",
      },
      {
        status: "applied",
        submittedAt: "2026-08-20T15:00:00.000Z",
        platform: "lever",
        title: "Engineer",
        resumeVariant: "backend.pdf",
        lastMailAt: null,
        statusUpdatedAt: "2026-08-20T15:00:00.000Z",
      },
      {
        status: "viewed",
        submittedAt: "2026-08-21T10:00:00.000Z",
        platform: "greenhouse",
        title: "Engineer",
        resumeVariant: "general.pdf",
        lastMailAt: "2026-08-21T20:00:00.000Z",
        statusUpdatedAt: "2026-08-21T20:00:00.000Z",
      },
      {
        status: "offer",
        submittedAt: "2026-08-22T10:00:00.000Z",
        platform: "greenhouse",
        title: "Staff Engineer",
        resumeVariant: "backend.pdf",
        lastMailAt: "2026-08-23T10:00:00.000Z",
        statusUpdatedAt: "2026-08-23T10:00:00.000Z",
      },
    ],
    aiCalls: [
      {
        createdAt: "2026-08-22T10:00:00.000Z",
        purpose: "repair_step",
        costUsd: 0.4,
        inTokens: 100,
        outTokens: 50,
        platform: "greenhouse",
        cacheHit: false,
      },
      {
        createdAt: "2026-08-22T11:00:00.000Z",
        purpose: "draft_answer",
        costUsd: 0.4,
        inTokens: 80,
        outTokens: 40,
        platform: "greenhouse",
        cacheHit: false,
      },
    ],
    runs: [{ wallMs: 1000, status: "succeeded" }],
    ...overrides,
  };
}

describe("metrics", () => {
  it("keeps the funnel monotonically non-increasing", () => {
    const snapshot = computeMetrics(input());
    expect(snapshot.funnel).toEqual({
      jobsAdded: 5,
      applied: 4,
      viewed: 2,
      screening: 1,
      interview: 1,
      offer: 1,
    });
    expect(funnelIsMonotonic(snapshot.funnel)).toBe(true);
    expect(snapshot.costPerApplication.applications).toBe(4);
    expect(snapshot.costPerApplication.usd).toBe(0.2);
    expect(snapshot.costPerApplication.tokens).toBe(270);
  });

  it("rejects an increasing funnel", () => {
    expect(
      funnelIsMonotonic({
        jobsAdded: 2,
        applied: 3,
        viewed: 1,
        screening: 1,
        interview: 0,
        offer: 0,
      }),
    ).toBe(false);
  });

  it("treats an empty pipeline as monotonic zeros", () => {
    const snapshot = computeMetrics({ jobsAdded: 0, applications: [], aiCalls: [], runs: [] });
    expect(funnelIsMonotonic(snapshot.funnel)).toBe(true);
    expect(snapshot.costPerApplication.usd).toBe(0);
  });
});
