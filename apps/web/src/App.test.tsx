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
      vi.fn(async () =>
        new Response(JSON.stringify({ jobs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(
      <MemoryRouter initialEntries={["/jobs"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Jobs" })).toBeTruthy();
    expect(screen.getByLabelText("Job URLs")).toBeTruthy();
  });

  it("renders the questions empty state", () => {
    render(
      <MemoryRouter initialEntries={["/questions"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Questions" })).toBeTruthy();
    expect(screen.getByText(/Nothing is guessed/)).toBeTruthy();
  });
});
