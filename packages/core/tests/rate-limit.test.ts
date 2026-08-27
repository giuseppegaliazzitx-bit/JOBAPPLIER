import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_CAP, hostFromUrl, humanDelayMs, shuffleBatch } from "../src/index.ts";

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("rate limit helpers", () => {
  it("uses a daily cap of 20", () => {
    expect(DEFAULT_DAILY_CAP).toBe(20);
  });

  it("shuffles deterministically from a seeded rng and keeps every item", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const first = shuffleBatch(items, rng(7));
    const second = shuffleBatch(items, rng(7));
    expect(first).toEqual(second);
    expect([...first].sort((a, b) => a - b)).toEqual(items);
    expect(first).not.toEqual(items);
    expect(shuffleBatch(items, rng(99))).not.toEqual(first);
  });

  it("draws human delays from a bounded lognormal range", () => {
    const draw = rng(3);
    const samples = Array.from({ length: 40 }, () => humanDelayMs(draw));
    expect(samples.every((ms) => ms >= 280 && ms <= 2800)).toBe(true);
    expect(new Set(samples).size).toBeGreaterThan(5);
  });

  it("extracts a lowercase hostname", () => {
    expect(hostFromUrl("https://Boards.Greenhouse.io/acme/jobs/1")).toBe("boards.greenhouse.io");
    expect(hostFromUrl("not a url")).toBe("unknown");
  });
});
