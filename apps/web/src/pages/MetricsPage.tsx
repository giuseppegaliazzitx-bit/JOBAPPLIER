import { useQuery } from "@tanstack/react-query";
import { fetchMetrics } from "../api.ts";

export function MetricsPage() {
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: fetchMetrics });
  const data = metrics.data;
  const funnel = data?.funnel;
  const cost = data?.costPerApplication;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-serif text-3xl">Metrics</h1>
      <p className="mt-2 text-mute">
        Cost per application is the headline. Funnel steps are cumulative and must never increase down the pipe.
      </p>

      <section className="mt-8 rounded-lg border border-rule bg-panel p-4">
        <h2 className="font-serif text-xl">Cost per application</h2>
        <p className="mt-2 font-serif text-4xl">${(cost?.usd ?? 0).toFixed(4)}</p>
        <p className="mt-1 text-sm text-mute">
          {cost?.tokens ?? 0} tokens · {cost?.wallMs ?? 0} ms wall · {cost?.applications ?? 0} applications
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl">Funnel</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            ["Jobs added", funnel?.jobsAdded],
            ["Applied", funnel?.applied],
            ["Viewed", funnel?.viewed],
            ["Screening", funnel?.screening],
            ["Interview", funnel?.interview],
            ["Offer", funnel?.offer],
          ].map(([label, value]) => (
            <li key={String(label)} className="rounded-md border border-rule bg-panel px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-mute">{label}</p>
              <p className="font-serif text-2xl">{value ?? 0}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl">AI fallback rate</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-mute">
              <th className="py-1">Day</th>
              <th>Platform</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {(data?.aiFallbackRate ?? []).length === 0 ? (
              <tr>
                <td className="py-3 text-mute" colSpan={3}>
                  No AI calls yet.
                </td>
              </tr>
            ) : (
              (data?.aiFallbackRate ?? []).map((row) => (
                <tr key={`${row.day}-${row.platform}`} className="border-t border-rule">
                  <td className="py-1">{row.day}</td>
                  <td>{row.platform}</td>
                  <td>{(row.rate * 100).toFixed(0)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl">Response rate by site</h2>
        <ul className="mt-2 text-sm">
          {(data?.responseRate.bySite ?? []).map((row) => (
            <li key={row.key}>
              {row.key}: {(row.rate * 100).toFixed(0)}% ({row.responded}/{row.applied})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
