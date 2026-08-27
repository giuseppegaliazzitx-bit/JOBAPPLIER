export const ENGINE_BROWSER = "sessionkit" as const;
export const ENGINE_CHANNEL = "chrome" as const;
export const SESSION_KIT_DIR = "enhanced_browser" as const;

/** Captchas are SessionKit's job: checkbox/audio reCAPTCHA, Cloudflare click, 2captcha fallback. */
export const CAPTCHA_POLICY = "sessionkit_solve" as const;

/** 2FA is never bypassed. Pause, notify, wait for a human. */
export const TWO_FA_POLICY = "detect_pause_notify" as const;

/** Email OTP is filled from parsed inbox mail, not from an authenticator. */
export const EMAIL_OTP_POLICY = "inbox_code" as const;

export const SESSIONKIT_CAPTCHA_CALLS = [
  "solve_challenges",
  "solve_recaptcha",
  "solve_recaptcha_v3",
  "solve_cloudflare",
] as const;
