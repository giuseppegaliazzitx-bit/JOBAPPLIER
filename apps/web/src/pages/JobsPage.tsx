export function JobsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-serif text-3xl">Jobs</h1>
      <p className="mt-2 text-mute">
        Paste box for multiple URLs arrives in Phase 1. Dedup, platform detection, and
        fit score wait for that phase.
      </p>
      <div className="mt-6 rounded-lg border border-dashed border-rule bg-panel px-4 py-10 text-center text-sm text-mute">
        No jobs in the inbox.
      </div>
    </div>
  );
}
