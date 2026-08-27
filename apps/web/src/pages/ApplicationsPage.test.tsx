import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Applications page", () => {
  it("lists submitted applications and their proof status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/applications")) {
          return new Response(
            JSON.stringify({
              applications: [
                {
                  id: "a1",
                  jobId: "j1",
                  runId: "r1",
                  submittedAt: "2026-08-27T12:00:00.000Z",
                  proofScreenshot: "/tmp/proof.png",
                  status: "applied",
                  url: "http://127.0.0.1:8790/apply",
                  title: "Engineer",
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
      <MemoryRouter initialEntries={["/applications"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Applications" })).toBeTruthy();
    expect(await screen.findByText("Engineer")).toBeTruthy();
    expect(screen.getByText("applied")).toBeTruthy();
    expect(screen.getByText("saved")).toBeTruthy();
  });
});
