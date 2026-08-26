import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CAPTCHA_POLICY,
  ENGINE_BROWSER,
  ENGINE_CHANNEL,
  FORBIDDEN_SESSIONKIT_CALLS,
  SESSION_KIT_DIR,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));

const PackageJson = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

describe("engine driver", () => {
  it("uses SessionKit on real Chrome, not Playwright Node", () => {
    expect(ENGINE_BROWSER).toBe("sessionkit");
    expect(ENGINE_CHANNEL).toBe("chrome");
    expect(SESSION_KIT_DIR).toBe("enhanced_browser");
  });

  it("does not depend on playwright", () => {
    const pkg = PackageJson.parse(
      JSON.parse(readFileSync(join(here, "../package.json"), "utf8")),
    );
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(names).not.toContain("playwright");
    expect(names).not.toContain("playwright-core");
    expect(names).not.toContain("patchright");
  });

  it("refuses captcha solving as policy", () => {
    expect(CAPTCHA_POLICY).toBe("detect_pause_notify");
    expect(FORBIDDEN_SESSIONKIT_CALLS).toContain("TwoCaptcha");
    expect(FORBIDDEN_SESSIONKIT_CALLS).toContain("solve_recaptcha");
  });
});
