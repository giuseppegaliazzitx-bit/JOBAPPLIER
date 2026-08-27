import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Recipes page", () => {
  it("renders health, version history, and promote/rollback/fixture controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/recipes")) {
          return new Response(
            JSON.stringify({
              recipes: [
                {
                  id: "greenhouse-platform",
                  scope: "platform",
                  platform: "greenhouse",
                  health: { status: "proposed", successRate: 0 },
                  versions: [
                    {
                      id: "v1",
                      version: 1,
                      status: "active",
                      createdBy: "manual",
                      stats: { runs: 0, successes: 0, failures: 0 },
                      autopilot: false,
                      steps: [],
                      stepFailureRates: [{ stepId: "gh-email", name: "Email", runs: 4, failures: 1 }],
                    },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(
      <MemoryRouter initialEntries={["/recipes"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Recipes" })).toBeTruthy();
    expect(await screen.findByText("greenhouse")).toBeTruthy();
    expect(screen.getAllByText(/active/).length).toBeGreaterThan(0);
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Promote" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rollback" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run against fixture" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable autopilot" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start recording" })).toBeTruthy();
  });
});
