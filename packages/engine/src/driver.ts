export const ENGINE_BROWSER = "sessionkit" as const;
export const ENGINE_CHANNEL = "chrome" as const;
export const SESSION_KIT_DIR = "enhanced_browser" as const;

export const CAPTCHA_POLICY = "detect_pause_notify" as const;

export const FORBIDDEN_SESSIONKIT_CALLS = [
  "solve_challenges",
  "solve_recaptcha",
  "solve_recaptcha_v3",
  "solve_cloudflare",
  "RecaptchaSolver",
  "TwoCaptcha",
] as const;
