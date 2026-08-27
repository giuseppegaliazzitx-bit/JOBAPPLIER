import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";

class FakeSocket {
  static last: FakeSocket | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() {
    FakeSocket.last = this;
  }
  close() {
    return undefined;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeSocket.last = null;
});

describe("Runs page", () => {
  it("renders live-view controls and preflight Approve/Cancel", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/runs") && method === "GET") {
          return new Response(JSON.stringify({ runs: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/api/runs") && method === "POST") {
          return new Response(JSON.stringify({ id: "run-1", jobId: "job-1" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/api/runs/run-1") && method === "GET") {
          return new Response(
            JSON.stringify({
              run: { id: "run-1", status: "blocked" },
              events: [
                {
                  seq: 0,
                  type: "step",
                  status: "ok",
                  durationMs: 12,
                  detail: {
                    rows: [{ labelRaw: "First Name", value: "Ada", source: "test", confidence: 1 }],
                  },
                },
              ],
              preflight: {
                runId: "run-1",
                url: "http://127.0.0.1:8790/apply/step/4",
                title: "Application — Step 4 of 4",
                rows: [
                  {
                    fingerprint: "fp1",
                    labelRaw: "First Name",
                    value: "Ada",
                    source: "test",
                    confidence: 1,
                    status: "resolved",
                    readBack: "Ada",
                    verified: true,
                  },
                ],
                ready: true,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    render(
      <MemoryRouter initialEntries={["/runs"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Runs" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start run" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abort" })).toBeTruthy();

    screen.getByRole("button", { name: "Start run" }).click();

    expect(await screen.findByRole("heading", { name: "Preflight" })).toBeTruthy();
    expect(screen.getByText("First Name")).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("test")).toBeTruthy();
    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toBeTruthy();
    expect((approve as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/0\. step/i)).toBeTruthy();
    });
    screen.getByText(/0\. step/i).click();
    expect(screen.getAllByText("First Name").length).toBeGreaterThan(0);
  });
});
