import { detectPlatform } from "./platform-detect.ts";
import { type ApplyKind } from "./platform.ts";
import { detectJobSource } from "./urls.ts";

export function classifyApplyKind(url: string, html?: string): ApplyKind {
  const platform = detectPlatform(url, html);
  if (platform !== "unknown") {
    return "external";
  }
  const source = detectJobSource(url);
  const lower = (html ?? "").toLowerCase();
  const easySignal =
    lower.includes("easy apply") ||
    lower.includes("easy-apply") ||
    lower.includes("indeed-apply") ||
    lower.includes("indeedapply") ||
    lower.includes("data-easy-apply");

  if ((source === "linkedin" || source === "indeed") && easySignal) {
    return "easy_apply";
  }
  return "unknown";
}
