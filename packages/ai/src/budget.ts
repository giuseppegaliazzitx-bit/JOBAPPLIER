export class BudgetExceededError extends Error {
  readonly kind: "run" | "day";

  constructor(kind: "run" | "day") {
    super(`AI ${kind} ceiling exceeded`);
    this.name = "BudgetExceededError";
    this.kind = kind;
  }
}

export class TokenBudget {
  runTokens = 0;
  dayUsd = 0;

  constructor(
    readonly runTokenCeiling: number,
    readonly daySpendCeiling: number,
  ) {}

  wouldExceed(tokens: number, usd: number): "run" | "day" | null {
    if (this.runTokens + tokens > this.runTokenCeiling) {
      return "run";
    }
    if (this.dayUsd + usd > this.daySpendCeiling) {
      return "day";
    }
    return null;
  }

  add(tokens: number, usd: number): void {
    const kind = this.wouldExceed(tokens, usd);
    if (kind) {
      throw new BudgetExceededError(kind);
    }
    this.runTokens += tokens;
    this.dayUsd += usd;
  }
}

export function costUsd(tier: "small" | "medium" | "large", inTokens: number, outTokens: number): number {
  const rates = {
    small: { in: 0.2 / 1_000_000, out: 0.5 / 1_000_000 },
    medium: { in: 1.2 / 1_000_000, out: 6 / 1_000_000 },
    large: { in: 3 / 1_000_000, out: 15 / 1_000_000 },
  }[tier];
  return inTokens * rates.in + outTokens * rates.out;
}
