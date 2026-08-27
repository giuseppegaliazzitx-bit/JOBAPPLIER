import { useQuery } from "@tanstack/react-query";
import { fetchDashboard } from "../api.ts";

export function DashboardPage() {
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const blockedRuns = dash.data?.blockedRuns ?? 0;
  const unanswered = dash.data?.unansweredQuestions ?? 0;
  const spend = dash.data?.todaySpend ?? 0;
  const degraded = dash.data?.degradedRecipes ?? 0;
  const cards = [
    { label: "Blocked runs", value: String(blockedRuns) },
    { label: "Unanswered questions", value: String(unanswered) },
    { label: "Today's spend", value: `$${spend.toFixed(2)}` },
    { label: "Degraded recipes", value: String(degraded) },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-serif text-3xl">What needs you</h1>
      <p className="mt-2 max-w-2xl text-mute">
        Healing pauses here when a selector cannot be repaired. Nothing submits without Approve.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.label} className="rounded-lg border border-rule bg-panel px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-mute">{card.label}</p>
            <p className="mt-1 font-serif text-3xl">{card.value}</p>
          </li>
        ))}
      </ul>
      <section className="mt-10">
        <h2 className="font-serif text-xl">Blocked queue</h2>
        {(dash.data?.blocked.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-mute">No blocked runs.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {dash.data?.blocked.map((item) => (
              <li key={item.id} className="rounded-md border border-rule bg-panel px-3 py-2">
                {item.reason ?? "blocked"} {item.runId ? `· run ${item.runId.slice(0, 8)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="font-serif text-xl">Notifications</h2>
        {(dash.data?.notifications.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-mute">No notifications.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {dash.data?.notifications.map((item) => (
              <li key={item.id}>{item.message}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
