import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";
import { NAV_ITEMS } from "./nav.ts";

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
