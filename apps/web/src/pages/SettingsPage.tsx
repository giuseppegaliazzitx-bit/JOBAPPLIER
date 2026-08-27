import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSettings, saveSettings } from "../api.ts";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const data = settings.data;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-serif text-3xl">Settings</h1>
      <p className="mt-2 text-mute">
        Autopilot is opt-in per recipe version, never global. Per-site automation defaults off.
      </p>
      {data ? <p className="mt-4 rounded-md border border-rule bg-panel p-3 text-sm">{data.tos}</p> : null}

      <section className="mt-8">
        <h2 className="font-serif text-xl">Per-site automation</h2>
        <p className="mt-1 text-sm text-mute">Off until you turn a site on. Quarantine turns it back off.</p>
        <ul className="mt-3 space-y-2">
          {Object.entries(data?.sites ?? {}).map(([site, on]) => (
            <li key={site} className="flex items-center justify-between rounded-md border border-rule bg-panel px-3 py-2 text-sm">
              <span>{site}</span>
              <label className="flex items-center gap-2">
                <span className="text-mute">{on ? "on" : "off"}</span>
                <input
                  type="checkbox"
                  aria-label={`Automation for ${site}`}
                  checked={on}
                  onChange={(event) =>
                    save.mutate({ sites: { ...data?.sites, [site]: event.target.checked } })
                  }
                />
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl">Daily cap</h2>
        <label className="mt-2 block text-sm">
          <span className="text-mute">Applications per site per day</span>
          <input
            type="number"
            min={1}
            aria-label="Daily cap"
            className="mt-1 w-32 rounded-md border border-rule bg-panel px-3 py-2"
            defaultValue={data?.dailyCap ?? 20}
            key={data?.dailyCap}
            onBlur={(event) => {
              const n = Number(event.target.value);
              if (Number.isFinite(n) && n >= 1) {
                save.mutate({ dailyCap: n });
              }
            }}
          />
        </label>
      </section>

      <dl className="mt-8 space-y-3 text-sm">
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
