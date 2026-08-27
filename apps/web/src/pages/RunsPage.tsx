import { PreflightSchema, type Preflight, type RunEvent } from "@autoapply/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRun, fetchRuns, postRunAction, startRun } from "../api.ts";

type StepRow = {
  labelRaw: string;
  value?: string;
  source?: string;
  confidence: number;
};

function mergeEvents(current: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  const bySeq = new Map<number, RunEvent>();
  for (const event of current) {
    bySeq.set(event.seq, event);
  }
  for (const event of incoming) {
    const existing = bySeq.get(event.seq);
    if (!existing) {
      bySeq.set(event.seq, event);
      continue;
    }
    bySeq.set(event.seq, {
      ...existing,
      ...event,
      thumbnailDataUrl: event.thumbnailDataUrl ?? existing.thumbnailDataUrl,
    });
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

function rowsFromEvent(event: RunEvent): StepRow[] | null {
  if (typeof event.detail !== "object" || event.detail === null) {
    return null;
  }
  const detail = event.detail as Record<string, unknown>;
  if (event.type === "step" && Array.isArray(detail.rows)) {
    return detail.rows.flatMap((row) => {
      if (typeof row !== "object" || row === null) {
        return [];
      }
      const rec = row as Record<string, unknown>;
      if (typeof rec.labelRaw !== "string") {
        return [];
      }
      return [
        {
          labelRaw: rec.labelRaw,
          value: typeof rec.value === "string" ? rec.value : undefined,
          source: typeof rec.source === "string" ? rec.source : undefined,
          confidence: typeof rec.confidence === "number" ? rec.confidence : 0,
        },
      ];
    });
  }
  if (event.type === "fill" && typeof detail.labelRaw === "string") {
    return [
      {
        labelRaw: detail.labelRaw,
        value: typeof detail.attempted === "string" ? detail.attempted : undefined,
        source: "fill",
        confidence: detail.ok === true ? 1 : 0,
      },
    ];
  }
  if (event.type === "resolve" && Array.isArray(detail.resolutions)) {
    return detail.resolutions.flatMap((row) => {
      if (typeof row !== "object" || row === null) {
        return [];
      }
      const rec = row as Record<string, unknown>;
      if (typeof rec.labelRaw !== "string") {
        return [];
      }
      return [
        {
          labelRaw: rec.labelRaw,
          value: typeof rec.value === "string" ? rec.value : undefined,
          source: typeof rec.source === "string" ? rec.source : undefined,
          confidence: typeof rec.confidence === "number" ? rec.confidence : 0,
        },
      ];
    });
  }
  return null;
}

export function RunsPage() {
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [url, setUrl] = useState("http://127.0.0.1:8790/apply");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const list = useQuery({
    queryKey: ["runs"],
    queryFn: fetchRuns,
    refetchInterval: 4000,
  });

  const start = useMutation({
    mutationFn: () => startRun(url),
    onSuccess: (body) => {
      setRunId(body.id);
      setEvents([]);
      setPreflight(null);
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const detail = useQuery({
    queryKey: ["run", runId],
    queryFn: () => fetchRun(runId ?? ""),
    enabled: Boolean(runId),
    refetchInterval: 2000,
  });

  useEffect(() => {
    const incoming = detail.data?.events;
    if (incoming) {
      setEvents((current) => mergeEvents(current, incoming));
    }
    if (detail.data?.preflight) {
      setPreflight(detail.data.preflight);
    }
  }, [detail.data]);

  useEffect(() => {
    if (!runId) {
      return;
    }
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/runs/${runId}`);
    socket.onmessage = (message) => {
      const parsed: unknown = JSON.parse(String(message.data));
      if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
        return;
      }
      const envelope = parsed as { type: string; data?: string; event?: RunEvent; preflight?: unknown };
      if (envelope.type === "frame" && envelope.data && canvasRef.current) {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) {
            return;
          }
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return;
          }
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
        };
        img.src = `data:image/jpeg;base64,${envelope.data}`;
      }
      if (envelope.type === "event" && envelope.event) {
        setEvents((current) => mergeEvents(current, [envelope.event as RunEvent]));
      }
      if (envelope.type === "preflight") {
        const next = PreflightSchema.safeParse(envelope.preflight);
        if (next.success) {
          setPreflight(next.data);
        }
      }
    };
    return () => socket.close();
  }, [runId]);

  const selectedEvent = useMemo(
    () => (selected === null ? undefined : events.find((event) => event.seq === selected)),
    [events, selected],
  );
  const selectedRows = selectedEvent ? rowsFromEvent(selectedEvent) : null;

  function action(kind: "pause" | "resume" | "step" | "abort" | "approve") {
    if (!runId) {
      return;
    }
    void postRunAction(runId, kind).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["run", runId] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-serif text-3xl">Runs</h1>
      <p className="mt-2 text-mute">
        Fill happens live. Submit only happens when you click Approve.
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          start.mutate();
        }}
      >
        <input
          aria-label="Application URL"
          className="flex-1 rounded-md border border-rule bg-panel px-3 py-2 font-mono text-sm"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm text-paper">
          Start run
        </button>
      </form>
      {runId ? (
        <p className="mt-2 text-xs text-mute">
          Run {runId} · {String(detail.data?.run.status ?? "starting")}
        </p>
      ) : null}

      {list.data && list.data.runs.length > 0 ? (
        <ul className="mt-4 text-sm">
          {list.data.runs.slice(0, 8).map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setRunId(row.id);
                  setEvents([]);
                  setPreflight(null);
                }}
              >
                {row.id.slice(0, 8)} · {row.status}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex gap-2 text-sm">
            <button type="button" className="underline" onClick={() => action("pause")}>
              Pause
            </button>
            <button type="button" className="underline" onClick={() => action("resume")}>
              Resume
            </button>
            <button type="button" className="underline" onClick={() => action("step")}>
              Step
            </button>
            <button type="button" className="underline" onClick={() => action("abort")}>
              Abort
            </button>
          </div>
          <canvas ref={canvasRef} className="w-full rounded-md border border-rule bg-black" />
        </section>
        <section>
          <h2 className="font-serif text-xl">Timeline</h2>
          <ol className="mt-2 max-h-80 overflow-auto text-sm">
            {events.map((event) => (
              <li key={event.seq} className="border-b border-rule py-1">
                <button type="button" className="flex w-full items-center gap-2 text-left hover:bg-paper" onClick={() => setSelected(event.seq)}>
                  {event.thumbnailDataUrl ? (
                    <img alt="" className="h-10 w-14 rounded object-cover" src={event.thumbnailDataUrl} />
                  ) : event.screenshotPath && runId ? (
                    <img
                      alt=""
                      className="h-10 w-14 rounded object-cover"
                      src={`/api/runs/${runId}/events/${event.seq}/screenshot`}
                    />
                  ) : null}
                  <span>
                    {event.seq}. {event.type} · {event.status}
                    {event.durationMs ? ` · ${event.durationMs}ms` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {selectedRows ? (
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="text-mute">
                  <th className="py-1">Label</th>
                  <th>Value</th>
                  <th>Source</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {selectedRows.map((row) => (
                  <tr key={row.labelRaw} className="border-t border-rule">
                    <td className="py-1">{row.labelRaw}</td>
                    <td>{row.value ?? "—"}</td>
                    <td>{row.source ?? "—"}</td>
                    <td>{row.confidence.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : selectedEvent ? (
            <pre className="mt-2 overflow-auto rounded-md bg-paper p-2 text-xs">
              {JSON.stringify(selectedEvent.detail, null, 2)}
            </pre>
          ) : null}
        </section>
      </div>

      {preflight ? (
        <section className="mt-8">
          <h2 className="font-serif text-xl">Preflight</h2>
          <p className="text-sm text-mute">{preflight.title}</p>
          {preflight.screenshotDataUrl ? (
            <img alt="Preflight screenshot" className="mt-2 max-h-64 rounded-md border border-rule" src={preflight.screenshotDataUrl} />
          ) : null}
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="text-mute">
                <th className="py-1">Label</th>
                <th>Value</th>
                <th>Source</th>
                <th>Confidence</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {preflight.rows.map((row) => (
                <tr key={row.fingerprint} className="border-t border-rule">
                  <td className="py-1">{row.labelRaw}</td>
                  <td>{row.value ?? "—"}</td>
                  <td>{row.source ?? "—"}</td>
                  <td>{row.confidence.toFixed(2)}</td>
                  <td>{row.verified ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={!preflight.ready || !runId}
              className="rounded-md bg-ok px-4 py-2 text-sm text-paper disabled:opacity-40"
              onClick={() => action("approve")}
            >
              Approve
            </button>
            <button
              type="button"
              className="rounded-md border border-ink px-4 py-2 text-sm"
              onClick={() => action("abort")}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
