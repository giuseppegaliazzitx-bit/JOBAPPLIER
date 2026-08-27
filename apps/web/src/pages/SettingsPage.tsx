export function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-serif text-3xl">Settings</h1>
      <p className="mt-2 text-mute">
        Autopilot is opt-in per recipe version, never global. Per-site automation
        defaults off for sites whose terms prohibit it.
      </p>
      <dl className="mt-6 space-y-3 text-sm">
        <div>
          <dt className="text-mute">Browser</dt>
          <dd>SessionKit · patchright Chrome</dd>
        </div>
        <div>
          <dt className="text-mute">CAPTCHA</dt>
          <dd>SessionKit solves them (audio reCAPTCHA, Cloudflare, 2captcha fallback).</dd>
        </div>
        <div>
          <dt className="text-mute">2FA</dt>
          <dd>Detect, pause, notify. Never bypassed.</dd>
        </div>
      </dl>
    </div>
  );
}
