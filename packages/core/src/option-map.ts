import { collapseWs } from "./normalize.ts";
import { cosine } from "./cosine.ts";
import type { FieldOption } from "./field.ts";

export type OptionMapResult =
  | { status: "mapped"; option: FieldOption; step: 1 | 2 | 3 | 4 }
  | { status: "unmapped"; step: 5 };

function norm(value: string): string {
  return collapseWs(value.toLowerCase());
}

export type OptionEmbedFn = (text: string) => ArrayLike<number> | Promise<ArrayLike<number>>;

export async function mapOption(
  canonical: string,
  options: FieldOption[],
  embed?: OptionEmbedFn,
  aliases?: Array<{ optionsHash: string; canonicalValue: string; chosenOption: string }>,
  optionsHash?: string,
): Promise<OptionMapResult> {
  if (aliases && optionsHash) {
    const alias = aliases.find(
      (item) => item.optionsHash === optionsHash && norm(item.canonicalValue) === norm(canonical),
    );
    if (alias) {
      const hit = options.find(
        (option) => option.value === alias.chosenOption || option.label === alias.chosenOption,
      );
      if (hit) {
        return { status: "mapped", option: hit, step: 1 };
      }
    }
  }

  const exact = options.find((option) => option.value === canonical || option.label === canonical);
  if (exact) {
    return { status: "mapped", option: exact, step: 1 };
  }

  const target = norm(canonical);
  const insensitive = options.filter(
    (option) => norm(option.value) === target || norm(option.label) === target,
  );
  if (insensitive.length === 1 && insensitive[0]) {
    return { status: "mapped", option: insensitive[0], step: 2 };
  }

  const contained = options.filter((option) => {
    const label = norm(option.label);
    const value = norm(option.value);
    return (
      label === target ||
      value === target ||
      (target.length >= 3 && (label.startsWith(target) || label.includes(` ${target} `) || ` ${label} `.includes(` ${target} `)))
    );
  });
  if (contained.length === 1 && contained[0]) {
    return { status: "mapped", option: contained[0], step: 3 };
  }

  if (embed && options.length > 0) {
    const query = await embed(canonical);
    const scored: Array<{ option: FieldOption; score: number }> = [];
    for (const option of options) {
      const vec = await embed(option.label);
      scored.push({ option, score: cosine(query, vec) });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    const second = scored[1];
    if (top && top.score >= 0.85 && (second === undefined || top.score - second.score >= 0.15)) {
      return { status: "mapped", option: top.option, step: 4 };
    }
  }

  return { status: "unmapped", step: 5 };
}
