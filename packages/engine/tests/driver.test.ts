import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CAPTCHA_POLICY,
  ENGINE_BROWSER,
  ENGINE_CHANNEL,
  SESSIONKIT_CAPTCHA_CALLS,
  SESSION_KIT_DIR,
  TWO_FA_POLICY,
  EMAIL_OTP_POLICY,
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

  it("uses Playwright only for read-only extraction, not as the live driver", () => {
    const pkg = PackageJson.parse(
      JSON.parse(readFileSync(join(here, "../package.json"), "utf8")),
    );
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(names).toContain("playwright");
    expect(ENGINE_BROWSER).toBe("sessionkit");
  });

  it("uses SessionKit to solve captchas and still pauses for 2FA", () => {
    expect(CAPTCHA_POLICY).toBe("sessionkit_solve");
    expect(SESSIONKIT_CAPTCHA_CALLS).toContain("solve_challenges");
    expect(SESSIONKIT_CAPTCHA_CALLS).toContain("solve_recaptcha");
    expect(TWO_FA_POLICY).toBe("detect_pause_notify");
    expect(EMAIL_OTP_POLICY).toBe("inbox_code");
  });
});
