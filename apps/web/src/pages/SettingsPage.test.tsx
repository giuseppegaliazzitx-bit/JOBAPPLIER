import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Settings page", () => {
  it("renders ToS copy, per-site toggles defaulting off, and the daily cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/settings")) {
          return new Response(
            JSON.stringify({
              sites: { greenhouse: false, lever: false },
              dailyCap: 20,
              captchaPolicy: "sessionkit_solve",
              twoFaPolicy: "detect_pause_notify",
              tos: "Turning automation on for a site is your call. Many employer terms of service prohibit automated applications. Per-site automation defaults off.",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(await screen.findByText(/terms of service prohibit automated applications/i)).toBeTruthy();
    expect(screen.getByLabelText("Automation for greenhouse")).toBeTruthy();
    expect((screen.getByLabelText("Automation for greenhouse") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByLabelText("Daily cap")).toBeTruthy();
    expect(screen.getByText(/SessionKit solves them/i)).toBeTruthy();
    expect(screen.getByText(/Never bypassed/i)).toBeTruthy();
  });
});
