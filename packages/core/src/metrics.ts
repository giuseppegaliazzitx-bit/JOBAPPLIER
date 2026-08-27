import { z } from "zod";

const FALLBACK_PURPOSES = new Set(["classify_page", "resolve_labels", "map_option", "repair_step"]);

const REACHED = {
  viewed: new Set(["viewed", "screening", "interview", "offer"]),
  screening: new Set(["screening", "interview", "offer"]),
  interview: new Set(["interview", "offer"]),
  offer: new Set(["offer"]),
};

export const FunnelSchema = z.object({
  jobsAdded: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  viewed: z.number().int().nonnegative(),
  screening: z.number().int().nonnegative(),
  interview: z.number().int().nonnegative(),
  offer: z.number().int().nonnegative(),
});
export type Funnel = z.infer<typeof FunnelSchema>;

export const SliceRateSchema = z.object({
  key: z.string(),
  applied: z.number().int().nonnegative(),
  responded: z.number().int().nonnegative(),
  rate: z.number().nonnegative(),
});
export type SliceRate = z.infer<typeof SliceRateSchema>;

export const MetricsSnapshotSchema = z.object({
  funnel: FunnelSchema,
  costPerApplication: z.object({
    usd: z.number().nonnegative(),
    tokens: z.number().nonnegative(),
    wallMs: z.number().nonnegative(),
    applications: z.number().int().nonnegative(),
  }),
  costOverTime: z.array(
    z.object({
      day: z.string(),
      usdPerApp: z.number().nonnegative(),
      applications: z.number().int().nonnegative(),
    }),
  ),
  aiFallbackRate: z.array(
    z.object({
      day: z.string(),
      platform: z.string(),
      rate: z.number().nonnegative(),
      calls: z.number().int().nonnegative(),
      fallbacks: z.number().int().nonnegative(),
    }),
  ),
  responseRate: z.object({
    bySite: z.array(SliceRateSchema),
    byResume: z.array(SliceRateSchema),
    byTitle: z.array(SliceRateSchema),
    byDay: z.array(SliceRateSchema),
    byHour: z.array(SliceRateSchema),
  }),
  timeToResponse: z.object({
    medianHours: z.number().nullable(),
    buckets: z.array(z.object({ label: z.string(), count: z.number().int().nonnegative() })),
  }),
});
export type MetricsSnapshot = z.infer<typeof MetricsSnapshotSchema>;

export type MetricsApplication = {
  status: string;
  submittedAt: string | null;
  platform: string;
  title: string | null;
  resumeVariant: string | null;
  lastMailAt: string | null;
  statusUpdatedAt: string;
};

export type MetricsAiCall = {
  createdAt: string;
  purpose: string;
  costUsd: number;
  inTokens: number;
  outTokens: number;
  platform: string | null;
  cacheHit: boolean;
};

export type MetricsRun = {
  wallMs: number | null;
  status: string;
};

export type MetricsInput = {
  jobsAdded: number;
  applications: MetricsApplication[];
  aiCalls: MetricsAiCall[];
  runs: MetricsRun[];
};

function responded(status: string): boolean {
  return status !== "applied" && status !== "ghosted";
}

function rate(applied: number, respondedCount: number): number {
  return applied === 0 ? 0 : respondedCount / applied;
}

function sliceBy(apps: MetricsApplication[], keyOf: (app: MetricsApplication) => string): SliceRate[] {
  const groups = new Map<string, { applied: number; responded: number }>();
  for (const app of apps) {
    const key = keyOf(app);
    const current = groups.get(key) ?? { applied: 0, responded: 0 };
    current.applied += 1;
    if (responded(app.status)) {
      current.responded += 1;
    }
    groups.set(key, current);
  }
  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      applied: value.applied,
      responded: value.responded,
      rate: rate(value.applied, value.responded),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function hourOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return String(date.getUTCHours()).padStart(2, "0");
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function firstResponseHours(app: MetricsApplication): number | null {
  if (app.status === "applied" || !app.submittedAt) {
    return null;
  }
  const start = new Date(app.submittedAt).getTime();
  const end = new Date(app.lastMailAt ?? app.statusUpdatedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return (end - start) / 3_600_000;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const even = sorted.length % 2 === 0;
  const a = sorted[mid];
  const b = sorted[mid - 1];
  if (a === undefined) {
    return null;
  }
  if (even && b !== undefined) {
    return (a + b) / 2;
  }
  return a;
}

export function computeFunnel(jobsAdded: number, applications: MetricsApplication[]): Funnel {
  return FunnelSchema.parse({
    jobsAdded,
    applied: applications.length,
    viewed: applications.filter((item) => REACHED.viewed.has(item.status)).length,
    screening: applications.filter((item) => REACHED.screening.has(item.status)).length,
    interview: applications.filter((item) => REACHED.interview.has(item.status)).length,
    offer: applications.filter((item) => REACHED.offer.has(item.status)).length,
  });
}

export function funnelIsMonotonic(funnel: Funnel): boolean {
  const steps = [funnel.jobsAdded, funnel.applied, funnel.viewed, funnel.screening, funnel.interview, funnel.offer];
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1] ?? 0;
    const next = steps[i] ?? 0;
    if (next > prev) {
      return false;
    }
  }
  return true;
}

export function computeMetrics(input: MetricsInput): MetricsSnapshot {
  const funnel = computeFunnel(input.jobsAdded, input.applications);
  const usd = input.aiCalls.reduce((sum, item) => sum + item.costUsd, 0);
  const tokens = input.aiCalls.reduce((sum, item) => sum + item.inTokens + item.outTokens, 0);
  const wallMs = input.runs.reduce((sum, item) => sum + (item.wallMs ?? 0), 0);
  const applications = input.applications.length;
  const byDay = new Map<string, { usd: number; apps: number }>();
  for (const app of input.applications) {
    const day = app.submittedAt ? dayOf(app.submittedAt) : "unknown";
    const current = byDay.get(day) ?? { usd: 0, apps: 0 };
    current.apps += 1;
    byDay.set(day, current);
  }
  for (const call of input.aiCalls) {
    const day = dayOf(call.createdAt);
    const current = byDay.get(day) ?? { usd: 0, apps: 0 };
    current.usd += call.costUsd;
    byDay.set(day, current);
  }
  const fallback = new Map<string, { calls: number; fallbacks: number }>();
  for (const call of input.aiCalls) {
    const key = `${dayOf(call.createdAt)}|${call.platform ?? "unknown"}`;
    const current = fallback.get(key) ?? { calls: 0, fallbacks: 0 };
    current.calls += 1;
    if (FALLBACK_PURPOSES.has(call.purpose) && !call.cacheHit) {
      current.fallbacks += 1;
    }
    fallback.set(key, current);
  }
  const hours = input.applications
    .map(firstResponseHours)
    .filter((item): item is number => item !== null);
  const buckets = [
    { label: "0-24h", count: hours.filter((h) => h <= 24).length },
    { label: "1-3d", count: hours.filter((h) => h > 24 && h <= 72).length },
    { label: "3-7d", count: hours.filter((h) => h > 72 && h <= 168).length },
    { label: "7-14d", count: hours.filter((h) => h > 168 && h <= 336).length },
    { label: "14d+", count: hours.filter((h) => h > 336).length },
  ];
  return MetricsSnapshotSchema.parse({
    funnel,
    costPerApplication: {
      usd: applications === 0 ? 0 : usd / applications,
      tokens,
      wallMs,
      applications,
    },
    costOverTime: [...byDay.entries()]
      .map(([day, value]) => ({
        day,
        applications: value.apps,
        usdPerApp: value.apps === 0 ? 0 : value.usd / value.apps,
      }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    aiFallbackRate: [...fallback.entries()]
      .map(([key, value]) => {
        const [day, platform] = key.split("|");
        return {
          day: day ?? "unknown",
          platform: platform ?? "unknown",
          calls: value.calls,
          fallbacks: value.fallbacks,
          rate: value.calls === 0 ? 0 : value.fallbacks / value.calls,
        };
      })
      .sort((a, b) => `${a.day}${a.platform}`.localeCompare(`${b.day}${b.platform}`)),
    responseRate: {
      bySite: sliceBy(input.applications, (app) => app.platform),
      byResume: sliceBy(input.applications, (app) => app.resumeVariant ?? "unknown"),
      byTitle: sliceBy(input.applications, (app) => app.title ?? "unknown"),
      byDay: sliceBy(input.applications, (app) => (app.submittedAt ? dayOf(app.submittedAt) : "unknown")),
      byHour: sliceBy(input.applications, (app) => (app.submittedAt ? hourOf(app.submittedAt) : "unknown")),
    },
    timeToResponse: {
      medianHours: median(hours),
      buckets,
    },
  });
}
