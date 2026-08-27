import { ApplicationStatusSchema } from "@autoapply/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  addApplicationContact,
  addApplicationInterview,
  addApplicationNote,
  connectGmail,
  fetchApplications,
  patchApplicationStatus,
  sweepFollowUps,
  syncGmail,
} from "../api.ts";

const PIPELINE = ApplicationStatusSchema.options;

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const applications = useQuery({ queryKey: ["applications"], queryFn: fetchApplications });
  const rows = applications.data?.applications ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [contactName, setContactName] = useState("");
  const [interviewAt, setInterviewAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const current = rows.find((row) => row.id === selected) ?? rows[0];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["applications"] });

  const status = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => patchApplicationStatus(id, next),
    onSuccess: () => refresh(),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-serif text-3xl">Applications</h1>
      <p className="mt-2 text-mute">
        Pipeline: applied → viewed → screening → interview → offer → rejected → ghosted. Mail updates
        this automatically. A manual status is never overwritten.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a className="rounded-md bg-ink px-3 py-2 text-sm text-paper" href="/api/applications.csv">
          Export CSV
        </a>
        <button
          type="button"
          className="rounded-md border border-rule px-3 py-2 text-sm"
          onClick={() =>
            void connectGmail()
              .then((body) => {
                window.location.href = body.url;
              })
              .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "gmail failed"))
          }
        >
          Connect Gmail (read-only)
        </button>
        <button
          type="button"
          className="rounded-md border border-rule px-3 py-2 text-sm"
          onClick={() =>
            void syncGmail()
              .then((body) => setMessage(`Ingested ${body.ingested} messages`))
              .then(() => refresh())
              .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "sync failed"))
          }
        >
          Sync inbox
        </button>
        <button
          type="button"
          className="rounded-md border border-rule px-3 py-2 text-sm"
          onClick={() =>
            void sweepFollowUps()
              .then((body) => setMessage(`Follow-ups: ${body.nudged}`))
              .then(() => refresh())
          }
        >
          Check follow-ups
        </button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="text-mute">
            <th className="py-1">Title</th>
            <th>Company</th>
            <th>Status</th>
            <th>Resume</th>
            <th>Submitted</th>
            <th>Proof</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="py-6 text-mute" colSpan={6}>
                Empty until a submit succeeds.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={`cursor-pointer border-t border-rule ${current?.id === row.id ? "bg-panel" : ""}`}
                onClick={() => setSelected(row.id)}
              >
                <td className="py-2">{row.title ?? row.url ?? row.jobId}</td>
                <td>{row.companyName ?? "—"}</td>
                <td>
                  <label className="sr-only" htmlFor={`status-${row.id}`}>
                    Status for {row.title ?? row.id}
                  </label>
                  <select
                    id={`status-${row.id}`}
                    aria-label={`Status for ${row.title ?? row.id}`}
                    className="rounded-md border border-rule bg-panel px-2 py-1"
                    value={row.status}
                    onChange={(event) => status.mutate({ id: row.id, next: event.target.value })}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {PIPELINE.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  {row.sourceOfStatus === "manual" ? <span className="ml-2 text-xs text-mute">manual</span> : null}
                  {row.followUpAt ? <span className="ml-2 text-xs text-accent">nudge</span> : null}
                </td>
                <td>{row.resumeVariant ?? "—"}</td>
                <td>{row.submittedAt ?? "—"}</td>
                <td>
                  {row.proofScreenshot ? (
                    <a className="underline" href={`/api/applications/${row.id}/proof`} target="_blank" rel="noreferrer">
                      proof
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {current ? (
        <section className="mt-8 grid gap-6 md:grid-cols-3">
          <div>
            <h2 className="font-serif text-xl">Notes</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(current.notes ?? []).map((item) => (
                <li key={item.id}>{item.body}</li>
              ))}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!note.trim()) {
                  return;
                }
                void addApplicationNote(current.id, note).then(() => {
                  setNote("");
                  void refresh();
                });
              }}
            >
              <input
                aria-label="New note"
                className="flex-1 rounded-md border border-rule bg-panel px-2 py-1 text-sm"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <button type="submit" className="underline">
                Add
              </button>
            </form>
          </div>
          <div>
            <h2 className="font-serif text-xl">Contacts</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(current.contacts ?? []).map((item) => (
                <li key={item.id}>
                  {item.name}
                  {item.role ? ` · ${item.role}` : ""}
                </li>
              ))}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!contactName.trim()) {
                  return;
                }
                void addApplicationContact(current.id, { name: contactName, role: "recruiter" }).then(() => {
                  setContactName("");
                  void refresh();
                });
              }}
            >
              <input
                aria-label="Contact name"
                className="flex-1 rounded-md border border-rule bg-panel px-2 py-1 text-sm"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
              <button type="submit" className="underline">
                Add
              </button>
            </form>
          </div>
          <div>
            <h2 className="font-serif text-xl">Interviews</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(current.interviews ?? []).map((item) => (
                <li key={item.id}>
                  {item.kind} · {item.scheduledAt}
                </li>
              ))}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!interviewAt) {
                  return;
                }
                void addApplicationInterview(current.id, { scheduledAt: new Date(interviewAt).toISOString(), kind: "onsite" }).then(
                  () => {
                    setInterviewAt("");
                    void refresh();
                  },
                );
              }}
            >
              <input
                aria-label="Interview date"
                type="datetime-local"
                className="flex-1 rounded-md border border-rule bg-panel px-2 py-1 text-sm"
                value={interviewAt}
                onChange={(event) => setInterviewAt(event.target.value)}
              />
              <button type="submit" className="underline">
                Add
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
