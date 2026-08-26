const CARDS = [
  { label: "Blocked runs", value: "0" },
  { label: "Unanswered questions", value: "0" },
  { label: "Today's spend", value: "$0.00" },
  { label: "Degraded recipes", value: "0" },
] as const;

export function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-serif text-3xl">What needs you</h1>
      <p className="mt-2 max-w-2xl text-mute">
        Nothing is queued yet. Paste job links on Jobs once intake lands. Until then
        this page is the empty board.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {CARDS.map((card) => (
          <li key={card.label} className="rounded-lg border border-rule bg-panel px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-mute">{card.label}</p>
            <p className="mt-1 font-serif text-3xl">{card.value}</p>
          </li>
        ))}
      </ul>
      <section className="mt-10">
        <h2 className="font-serif text-xl">Recent activity</h2>
        <p className="mt-2 text-sm text-mute">No runs yet.</p>
      </section>
    </div>
  );
}
