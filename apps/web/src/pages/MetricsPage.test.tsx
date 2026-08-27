import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Metrics page", () => {
  it("renders cost per application and the funnel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("metrics")) {
          return new Response(
            JSON.stringify({
              funnel: { jobsAdded: 5, applied: 4, viewed: 2, screening: 1, interview: 1, offer: 1 },
              costPerApplication: { usd: 0.2, tokens: 270, wallMs: 1000, applications: 4 },
              costOverTime: [],
              aiFallbackRate: [{ day: "2026-08-22", platform: "greenhouse", rate: 0.5, calls: 2, fallbacks: 1 }],
              responseRate: { bySite: [{ key: "greenhouse", applied: 3, responded: 2, rate: 2 / 3 }], byResume: [], byTitle: [], byDay: [], byHour: [] },
              timeToResponse: { medianHours: 10, buckets: [] },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(
      <MemoryRouter initialEntries={["/metrics"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Metrics" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Cost per application" })).toBeTruthy();
    expect(await screen.findByText(/0\.2000/)).toBeTruthy();
    expect(screen.getByText("Jobs added")).toBeTruthy();
    expect(screen.getByText("greenhouse")).toBeTruthy();
  });
});
