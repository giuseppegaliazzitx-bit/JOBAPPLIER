import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import { NAV_ITEMS } from "./nav.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App shell", () => {
  it("renders every primary nav destination", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "What needs you" })).toBeTruthy();
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole("link", { name: item.label })).toBeTruthy();
    }
  });

  it("renders the jobs paste box", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/searches")) {
          return new Response(JSON.stringify({ searches: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ jobs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    render(
      <MemoryRouter initialEntries={["/jobs"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Jobs" })).toBeTruthy();
    expect(screen.getByLabelText("Job URLs")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Queue batch (shuffled)" })).toBeTruthy();
  });

  it("renders the questions empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/questions")) {
          return new Response(JSON.stringify({ questions: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/completeness")) {
          return new Response(JSON.stringify({ gaps: [], totalQuestions: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
    render(
      <MemoryRouter initialEntries={["/questions"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Questions" })).toBeTruthy();
    expect(await screen.findByText(/The queue is empty/)).toBeTruthy();
  });
});
