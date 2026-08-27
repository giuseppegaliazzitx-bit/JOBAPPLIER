import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Questions page", () => {
  it("re-renders a Workday field as the original control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/questions") && !url.includes("answer")) {
          return new Response(
            JSON.stringify({
              questions: [
                {
                  id: "q1",
                  fingerprint: "fp1",
                  labelRaw: "Legal First Name",
                  labelNorm: "legal first name",
                  type: "text",
                  widget: "native",
                  required: true,
                  occurrences: 2,
                  blocked: [{ title: "Software Engineer" }],
                  answer: null,
                },
                {
                  id: "q2",
                  fingerprint: "fp2",
                  labelRaw: "Are you legally authorized to work in the United States?",
                  labelNorm: "are you legally authorize to work in the united state",
                  type: "radio",
                  widget: "native",
                  required: false,
                  options: [
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ],
                  sectionHeading: "Are you legally authorized to work in the United States?",
                  occurrences: 1,
                  blocked: [{ title: "Software Engineer" }],
                  answer: null,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/completeness")) {
          return new Response(JSON.stringify({ gaps: [], totalQuestions: 2 }), {
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

    expect(await screen.findByText("Legal First Name")).toBeTruthy();
    expect(screen.getByText("*")).toBeTruthy();
    expect(
      screen.getAllByText("Are you legally authorized to work in the United States?").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: "Yes" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "No" })).toBeTruthy();
    expect(screen.getAllByText(/Software Engineer/).length).toBeGreaterThan(0);
  });
});
