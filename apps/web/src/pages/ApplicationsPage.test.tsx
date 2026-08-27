import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Applications page", () => {
  it("lists pipeline controls, proof, resume variant, and CSV export", async () => {
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
                  statusUpdatedAt: "2026-08-27T12:00:00.000Z",
                  sourceOfStatus: "submit",
                  resumeVariant: "general.pdf",
                  url: "http://127.0.0.1:8790/apply",
                  title: "Engineer",
                  companyName: "Acme",
                  notes: [{ id: "n1", body: "Followed up", createdAt: "2026-08-27T12:00:00.000Z" }],
                  contacts: [{ id: "c1", name: "Ada Recruiter", role: "recruiter" }],
                  interviews: [],
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
    expect(screen.getByRole("link", { name: "Export CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Gmail (read-only)" })).toBeTruthy();
    expect(screen.getByLabelText("Status for Engineer")).toBeTruthy();
    expect(screen.getByText("general.pdf")).toBeTruthy();
    expect(screen.getByRole("link", { name: "proof" })).toBeTruthy();
    expect(screen.getByText("Followed up")).toBeTruthy();
    expect(screen.getByText(/Ada Recruiter/)).toBeTruthy();
  });
});
