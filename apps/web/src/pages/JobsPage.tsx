import { ApplyKindSchema, JobStatusSchema, PlatformSchema } from "@autoapply/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { createSearch, fetchJobGap, fetchJobs, fetchSearches, pasteJobs, postBatch, runSearch } from "../api.ts";

const PLATFORMS = PlatformSchema.options;
const STATUSES = JobStatusSchema.options;
const APPLY_KINDS = ApplyKindSchema.options;

export function JobsPage() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");
  const [applyKind, setApplyKind] = useState("");
  const [hideAgencies, setHideAgencies] = useState(false);
  const [hideStale, setHideStale] = useState(false);
  const [hideBlacklisted, setHideBlacklisted] = useState(true);
  const [hideReposts, setHideReposts] = useState(false);
  const [searchName, setSearchName] = useState("Watchlist");
  const [gap, setGap] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      platform: platform || undefined,
      status: status || undefined,
      applyKind: applyKind || undefined,
      staffingAgency: hideAgencies ? "false" : undefined,
      stale: hideStale ? "false" : undefined,
      blacklisted: hideBlacklisted ? "false" : undefined,
      hideReposts: hideReposts ? "true" : undefined,
    }),
    [platform, status, applyKind, hideAgencies, hideStale, hideBlacklisted, hideReposts],
  );

  const jobs = useQuery({
    queryKey: ["jobs", filters],
    queryFn: () => fetchJobs(filters),
  });
  const searches = useQuery({ queryKey: ["searches"], queryFn: fetchSearches });

  const ingest = useMutation({
    mutationFn: pasteJobs,
    onSuccess: async () => {
      setText("");
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const results = ingest.data?.results ?? [];
  const listed = jobs.data ?? [];
  const batch = useMutation({
    mutationFn: () => postBatch(listed.map((job) => job.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-serif text-3xl">Jobs</h1>
      <p className="mt-2 text-mute">
        Paste one or many posting URLs. Detection is URL patterns, then page fingerprints. Unknown
        stays unknown.
      </p>

      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim().length === 0) {
            return;
          }
          ingest.mutate(text);
        }}
      >
        <label className="block text-sm text-mute" htmlFor="job-urls">
          Job URLs
        </label>
        <textarea
          id="job-urls"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={"https://boards.greenhouse.io/acme/jobs/123\nhttps://jobs.lever.co/acme/abcd"}
          className="mt-1 min-h-32 w-full rounded-md border border-rule bg-panel px-3 py-2 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={ingest.isPending}
          className="mt-3 rounded-md bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
        >
          {ingest.isPending ? "Adding…" : "Add jobs"}
        </button>
      </form>

      {results.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm">
          {results.map((result) => (
            <li key={result.url}>
              {result.status === "error" ? (
                <span className="text-accent">
                  {result.url} — {result.message}
                </span>
              ) : (
                <span>
                  {result.job.platform} · {result.status} · {result.job.title ?? result.url}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <FilterSelect label="Platform" value={platform} onChange={setPlatform} options={PLATFORMS} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUSES} />
        <FilterSelect
          label="Apply kind"
          value={applyKind}
          onChange={setApplyKind}
          options={APPLY_KINDS}
        />
        <label className="text-sm">
          <input type="checkbox" checked={hideAgencies} onChange={(event) => setHideAgencies(event.target.checked)} />{" "}
          Hide staffing agencies
        </label>
        <label className="text-sm">
          <input type="checkbox" checked={hideStale} onChange={(event) => setHideStale(event.target.checked)} /> Hide
          stale (60+ days)
        </label>
        <label className="text-sm">
          <input
            type="checkbox"
            checked={hideBlacklisted}
            onChange={(event) => setHideBlacklisted(event.target.checked)}
          />{" "}
          Hide blacklisted
        </label>
        <label className="text-sm">
          <input type="checkbox" checked={hideReposts} onChange={(event) => setHideReposts(event.target.checked)} /> Hide
          reposts
        </label>
      </div>

      <div className="mt-6">
        <button
          type="button"
          className="rounded-md bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
          disabled={listed.length === 0 || batch.isPending}
          onClick={() => batch.mutate()}
        >
          {batch.isPending ? "Queuing…" : "Queue batch (shuffled)"}
        </button>
        {batch.data ? <p className="mt-2 text-sm text-mute">Queued {batch.data.queued} jobs.</p> : null}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-rule bg-panel">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-rule text-mute">
            <tr>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Platform</th>
              <th className="px-3 py-2 font-medium">Apply</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Fit</th>
            </tr>
          </thead>
          <tbody>
            {(jobs.data ?? []).length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-mute" colSpan={7}>
                  No jobs in the inbox.
                </td>
              </tr>
            ) : (
              (jobs.data ?? []).map((job) => (
                <tr key={job.id} className="border-t border-rule">
                  <td className="px-3 py-2">
                    <a className="underline decoration-rule" href={job.url} target="_blank" rel="noreferrer">
                      {job.title ?? job.canonicalUrl}
                    </a>
                  </td>
                  <td className="px-3 py-2">{job.companyName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge label={job.platform} />
                  </td>
                  <td className="px-3 py-2">{job.applyKind.replace("_", " ")}</td>
                  <td className="px-3 py-2">{job.status}</td>
                  <td className="px-3 py-2">{job.location ?? "—"}</td>
                  <td className="px-3 py-2">
                    {job.fitScore ?? "—"}{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        void fetchJobGap(job.id).then((body) =>
                          setGap(`${body.resume?.label ?? "no resume"}: missing ${body.gap.missing.join(", ") || "none"}`),
                        )
                      }
                    >
                      gap
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {gap ? <p className="mt-3 text-sm">Keyword gap: {gap}</p> : null}

      <section className="mt-10">
        <h2 className="font-serif text-xl">Saved searches</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) {
              return;
            }
            void createSearch({ name: searchName, text }).then(() => queryClient.invalidateQueries({ queryKey: ["searches"] }));
          }}
        >
          <input
            aria-label="Search name"
            className="rounded-md border border-rule bg-panel px-2 py-1 text-sm"
            value={searchName}
            onChange={(event) => setSearchName(event.target.value)}
          />
          <button type="submit" className="underline">
            Save URLs as search
          </button>
        </form>
        <ul className="mt-3 space-y-2 text-sm">
          {(searches.data?.searches ?? []).map((item) => (
            <li key={item.id}>
              {item.name}{" "}
              <button type="button" className="underline" onClick={() => void runSearch(item.id).then(() => queryClient.invalidateQueries({ queryKey: ["jobs"] }))}>
                Run now
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="text-sm">
      <span className="mr-2 text-mute">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="rounded-md border border-rule bg-panel px-2 py-1"
      >
        <option value="">Any</option>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Badge(props: { label: string }) {
  return (
    <span className="rounded-full bg-paper px-2 py-0.5 text-xs uppercase tracking-wide">
      {props.label}
    </span>
  );
}
