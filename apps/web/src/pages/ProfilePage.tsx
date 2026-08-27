import {
  PROFILE_FIELDS,
  requiredProfileKeys,
  type EducationEntry,
  type ProfileKey,
  type ProfileValues,
  type WorkHistoryEntry,
} from "@autoapply/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  fetchCompleteness,
  fetchDocuments,
  fetchProfile,
  patchDocument,
  saveProfile,
  uploadDocument,
} from "../api.ts";

const EMPTY: ProfileValues = {};

export function ProfilePage() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const documents = useQuery({ queryKey: ["documents"], queryFn: fetchDocuments });
  const completeness = useQuery({ queryKey: ["completeness"], queryFn: fetchCompleteness });
  const [draft, setDraft] = useState<ProfileValues>(EMPTY);

  useEffect(() => {
    if (profile.data) {
      setDraft(profile.data);
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: async (values) => {
      setDraft(values);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const required = requiredProfileKeys();
  const filled = required.filter((key) => {
    const value = draft[key];
    return typeof value === "string" ? value.length > 0 : value !== undefined;
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl">Profile</h1>
      <p className="mt-2 text-mute">
        Flat answers the form-filler will reuse. Nothing here is invented later.
      </p>
      <p className="mt-2 text-sm">
        Required fields filled: {filled.length}/{required.length}
      </p>
      {(completeness.data?.gaps.length ?? 0) > 0 ? (
        <p className="mt-2 text-sm text-mute">
          Most frequent unanswered questions:{" "}
          {completeness.data?.gaps
            .slice(0, 5)
            .map((gap) => gap.labelRaw)
            .join("; ")}
        </p>
      ) : null}

      <form
        className="mt-8 space-y-10"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({
            ...draft,
            workHistory: (draft.workHistory ?? []).filter(
              (entry) => entry.company.length > 0 && entry.title.length > 0,
            ),
            education: (draft.education ?? []).filter((entry) => entry.school.length > 0),
          });
        }}
      >
        <Section title="Identity" keys={keysIn("identity")} draft={draft} setDraft={setDraft} />
        <Section
          title="Work authorization"
          keys={keysIn("work_authorization")}
          draft={draft}
          setDraft={setDraft}
        />
        <Section title="Links" keys={keysIn("links")} draft={draft} setDraft={setDraft} />
        <WorkHistory draft={draft} setDraft={setDraft} />
        <Education draft={draft} setDraft={setDraft} />
        <Skills draft={draft} setDraft={setDraft} />

        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-md bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save profile"}
        </button>
        {save.isSuccess ? <span className="ml-3 text-sm text-ok">Saved.</span> : null}
        {save.isError ? <span className="ml-3 text-sm text-accent">Could not save.</span> : null}
      </form>

      <DocumentsPanel
        documents={documents.data ?? []}
        onUploaded={async () => {
          await queryClient.invalidateQueries({ queryKey: ["documents"] });
        }}
        onDefault={async (id) => {
          await patchDocument(id, { isDefault: true });
          await queryClient.invalidateQueries({ queryKey: ["documents"] });
        }}
      />
    </div>
  );
}

function keysIn(section: (typeof PROFILE_FIELDS)[number]["section"]): ProfileKey[] {
  return PROFILE_FIELDS.filter((field) => field.section === section && field.input !== "json").map(
    (field) => field.key,
  );
}

function Section(props: {
  title: string;
  keys: ProfileKey[];
  draft: ProfileValues;
  setDraft: (values: ProfileValues) => void;
}) {
  return (
    <section>
      <h2 className="font-serif text-xl">{props.title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {props.keys.map((key) => {
          const field = PROFILE_FIELDS.find((item) => item.key === key);
          if (!field) {
            return null;
          }
          const value = props.draft[key];
          const str = typeof value === "string" ? value : "";
          return (
            <label key={key} className="block text-sm">
              <span className="text-mute">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.input === "select" && field.options ? (
                <select
                  className="mt-1 w-full rounded-md border border-rule bg-panel px-3 py-2"
                  value={str}
                  onChange={(event) =>
                    props.setDraft({ ...props.draft, [key]: event.target.value || undefined })
                  }
                >
                  <option value="">Select</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="mt-1 w-full rounded-md border border-rule bg-panel px-3 py-2"
                  type={field.input === "json" ? "text" : field.input}
                  value={str}
                  onChange={(event) =>
                    props.setDraft({ ...props.draft, [key]: event.target.value })
                  }
                />
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function WorkHistory(props: {
  draft: ProfileValues;
  setDraft: (values: ProfileValues) => void;
}) {
  const entries = props.draft.workHistory ?? [];
  const update = (next: WorkHistoryEntry[]) => props.setDraft({ ...props.draft, workHistory: next });
  return (
    <section>
      <h2 className="font-serif text-xl">Work history</h2>
      <div className="mt-3 space-y-4">
        {entries.map((entry, index) => (
          <div key={`${entry.company}-${index}`} className="grid gap-2 rounded-md border border-rule bg-panel p-3 sm:grid-cols-2">
            <Text
              label="Company"
              value={entry.company}
              onChange={(company) => update(entries.map((item, i) => (i === index ? { ...item, company } : item)))}
            />
            <Text
              label="Title"
              value={entry.title}
              onChange={(title) => update(entries.map((item, i) => (i === index ? { ...item, title } : item)))}
            />
            <Text
              label="Start"
              value={entry.startDate}
              onChange={(startDate) =>
                update(entries.map((item, i) => (i === index ? { ...item, startDate } : item)))
              }
            />
            <Text
              label="End"
              value={entry.endDate ?? ""}
              onChange={(endDate) =>
                update(entries.map((item, i) => (i === index ? { ...item, endDate } : item)))
              }
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 text-sm underline"
        onClick={() => update([...entries, { company: "", title: "", startDate: "" }])}
      >
        Add role
      </button>
    </section>
  );
}

function Education(props: {
  draft: ProfileValues;
  setDraft: (values: ProfileValues) => void;
}) {
  const entries = props.draft.education ?? [];
  const update = (next: EducationEntry[]) => props.setDraft({ ...props.draft, education: next });
  return (
    <section>
      <h2 className="font-serif text-xl">Education</h2>
      <div className="mt-3 space-y-4">
        {entries.map((entry, index) => (
          <div key={`${entry.school}-${index}`} className="grid gap-2 rounded-md border border-rule bg-panel p-3 sm:grid-cols-2">
            <Text
              label="School"
              value={entry.school}
              onChange={(school) => update(entries.map((item, i) => (i === index ? { ...item, school } : item)))}
            />
            <Text
              label="Degree"
              value={entry.degree ?? ""}
              onChange={(degree) => update(entries.map((item, i) => (i === index ? { ...item, degree } : item)))}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 text-sm underline"
        onClick={() => update([...entries, { school: "" }])}
      >
        Add school
      </button>
    </section>
  );
}

function Skills(props: {
  draft: ProfileValues;
  setDraft: (values: ProfileValues) => void;
}) {
  const value = (props.draft.skills ?? []).join(", ");
  return (
    <section>
      <h2 className="font-serif text-xl">Skills</h2>
      <label className="mt-3 block text-sm">
        <span className="text-mute">Comma-separated</span>
        <input
          className="mt-1 w-full rounded-md border border-rule bg-panel px-3 py-2"
          value={value}
          onChange={(event) =>
            props.setDraft({
              ...props.draft,
              skills: event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item.length > 0),
            })
          }
        />
      </label>
    </section>
  );
}

function Text(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-mute">{props.label}</span>
      <input
        className="mt-1 w-full rounded-md border border-rule bg-panel px-3 py-2"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function DocumentsPanel(props: {
  documents: Array<{ id: string; kind: string; label: string; keywords: string[]; isDefault: boolean }>;
  onUploaded: () => Promise<void>;
  onDefault: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <section className="mt-12">
      <h2 className="font-serif text-xl">Documents</h2>
      <p className="mt-1 text-sm text-mute">Multiple resume variants, tagged with keywords. One default.</p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          setPending(true);
          void uploadDocument(data)
            .then(() => props.onUploaded())
            .finally(() => {
              setPending(false);
              form.reset();
            });
        }}
      >
        <label className="block text-sm">
          <span className="text-mute">File</span>
          <input className="mt-1 w-full text-sm" type="file" name="file" required />
        </label>
        <label className="block text-sm">
          <span className="text-mute">Label</span>
          <input className="mt-1 w-full rounded-md border border-rule bg-panel px-3 py-2" name="label" placeholder="Backend resume" />
        </label>
        <label className="block text-sm">
          <span className="text-mute">Kind</span>
          <select className="mt-1 w-full rounded-md border border-rule bg-panel px-3 py-2" name="kind" defaultValue="resume">
            <option value="resume">Resume</option>
            <option value="cover_letter">Cover letter</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-mute">Keywords</span>
          <input className="mt-1 w-full rounded-md border border-rule bg-panel px-3 py-2" name="keywords" placeholder="backend, python" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isDefault" value="true" />
          Mark as default
        </label>
        <button type="submit" disabled={pending} className="rounded-md border border-ink px-4 py-2 text-sm">
          {pending ? "Uploading…" : "Upload"}
        </button>
      </form>
      <ul className="mt-4 space-y-2 text-sm">
        {props.documents.length === 0 ? (
          <li className="text-mute">No documents yet.</li>
        ) : (
          props.documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between rounded-md border border-rule bg-panel px-3 py-2">
              <span>
                {doc.label} · {doc.kind}
                {doc.keywords.length > 0 ? ` · ${doc.keywords.join(", ")}` : ""}
                {doc.isDefault ? " · default" : ""}
              </span>
              {doc.isDefault ? null : (
                <button type="button" className="underline" onClick={() => void props.onDefault(doc.id)}>
                  Make default
                </button>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
