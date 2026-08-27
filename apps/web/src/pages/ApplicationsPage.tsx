import { useQuery } from "@tanstack/react-query";
import { fetchApplications } from "../api.ts";

export function ApplicationsPage() {
  const applications = useQuery({ queryKey: ["applications"], queryFn: fetchApplications });
  const rows = applications.data?.applications ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-serif text-3xl">Applications</h1>
      <p className="mt-2 text-mute">
        Tracker pipeline: applied → viewed → screening → interview → offer → rejected → ghosted.
        Proof screenshots are stored on each successful submit.
      </p>
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="text-mute">
            <th className="py-1">Title</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Proof</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="py-6 text-mute" colSpan={4}>
                Empty until a submit succeeds.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-rule">
                <td className="py-2">{row.title ?? row.url ?? row.jobId}</td>
                <td>{row.status}</td>
                <td>{row.submittedAt ?? "—"}</td>
                <td>{row.proofScreenshot ? "saved" : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
