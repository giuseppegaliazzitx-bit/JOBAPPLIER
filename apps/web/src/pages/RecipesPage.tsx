import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { fetchRecipes, patchRecipeAutopilot, patchRecipeSteps, postRecipeAction } from "../api.ts";

export function RecipesPage() {
  const queryClient = useQueryClient();
  const recipes = useQuery({ queryKey: ["recipes"], queryFn: fetchRecipes });
  const [recordUrl, setRecordUrl] = useState("http://127.0.0.1:8790/apply");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<Array<{ name: string; value: string }>>([]);
  const [edit, setEdit] = useState<{ recipeId: string; versionId: string; json: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recipes"] });

  const startRecord = useMutation({
    mutationFn: () => postRecipeAction("/api/recipes/record", { url: recordUrl }),
    onSuccess: (body) => {
      const id = typeof body === "object" && body && "id" in body ? String(body.id) : null;
      setSessionId(id);
      setMessage("Recording. Apply in the browser, then stop.");
    },
  });

  const stopRecord = useMutation({
    mutationFn: () => postRecipeAction(`/api/recipes/record/${sessionId}/stop`),
    onSuccess: (body) => {
      setSessionId(null);
      const next =
        typeof body === "object" && body && "unmatched" in body && Array.isArray(body.unmatched)
          ? body.unmatched.flatMap((item) => {
              if (typeof item !== "object" || item === null) return [];
              const rec = item as { name?: unknown; value?: unknown };
              if (typeof rec.name !== "string" || typeof rec.value !== "string") return [];
              return [{ name: rec.name, value: rec.value }];
            })
          : [];
      setUnmatched(next);
      setMessage("Recording stopped. Classify unmatched values, then save a proposed recipe.");
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-serif text-3xl">Recipes</h1>
      <p className="mt-2 text-mute">
        Overrides on the generic walker. Proposed versions must pass their fixture before shadow.
      </p>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}

      <section className="mt-6">
        <h2 className="font-serif text-xl">Health</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-mute">
              <th className="py-1">Platform</th>
              <th>Status</th>
              <th>Success rate</th>
              <th>Last success</th>
            </tr>
          </thead>
          <tbody>
            {(recipes.data?.recipes ?? []).map((recipe) => (
              <tr key={recipe.id} className="border-t border-rule">
                <td className="py-1">{recipe.platform}</td>
                <td>{recipe.health.status}</td>
                <td>{(recipe.health.successRate * 100).toFixed(0)}%</td>
                <td>{recipe.health.lastSuccessAt ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(recipes.data?.recipes ?? []).map((recipe) => (
        <section key={recipe.id} className="mt-8">
          <h2 className="font-serif text-xl">
            {recipe.platform} · {recipe.scope}
          </h2>
          <ol className="mt-3 space-y-3">
            {recipe.versions.map((version) => (
              <li key={version.id} className="rounded-md border border-rule bg-panel p-3 text-sm">
                <p>
                  v{version.version} · {version.status} · {version.createdBy} · {version.stats.successes}/
                  {version.stats.runs} ok
                  {version.status === "active"
                    ? ` · autopilot ${version.autopilot === true ? "on" : "off"}`
                    : ""}
                </p>
                <table className="mt-2 w-full text-left text-xs">
                  <thead>
                    <tr className="text-mute">
                      <th className="py-1">Step</th>
                      <th>Failures</th>
                      <th>Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(version.stepFailureRates ?? []).map((row) => (
                      <tr key={row.stepId} className="border-t border-rule">
                        <td className="py-1">{row.name}</td>
                        <td>{row.failures}</td>
                        <td>{row.runs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      void postRecipeAction(`/api/recipes/${recipe.id}/versions/${version.id}/promote`)
                        .then(() => refresh())
                        .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "promote failed"))
                    }
                  >
                    Promote
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      void postRecipeAction(`/api/recipes/${recipe.id}/versions/${version.id}/rollback`).then(() => refresh())
                    }
                  >
                    Rollback
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setEdit({ recipeId: recipe.id, versionId: version.id, json: JSON.stringify(version.steps, null, 2) })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      void postRecipeAction(`/api/recipes/${recipe.id}/versions/${version.id}/fixture`)
                        .then((body) => setMessage(JSON.stringify(body)))
                        .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "fixture failed"))
                    }
                  >
                    Run against fixture
                  </button>
                  {version.status === "active" ? (
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        void patchRecipeAutopilot(recipe.id, version.id, version.autopilot !== true).then(() => refresh())
                      }
                    >
                      {version.autopilot === true ? "Disable autopilot" : "Enable autopilot"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {edit ? (
        <section className="mt-8">
          <h2 className="font-serif text-xl">Edit steps</h2>
          <textarea
            aria-label="Recipe steps JSON"
            className="mt-2 h-48 w-full rounded-md border border-rule bg-panel p-2 font-mono text-xs"
            value={edit.json}
            onChange={(event) => setEdit({ ...edit, json: event.target.value })}
          />
          <button
            type="button"
            className="mt-2 rounded-md bg-ink px-3 py-1 text-sm text-paper"
            onClick={() => {
              const steps: unknown = JSON.parse(edit.json);
              void patchRecipeSteps(edit.recipeId, edit.versionId, steps).then(() => {
                setEdit(null);
                void refresh();
              });
            }}
          >
            Save
          </button>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-serif text-xl">Record</h2>
        <p className="mt-2 text-sm text-mute">
          Typed values matching the profile become profile.* — never literals. Unmatched values wait here for classification.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            startRecord.mutate();
          }}
        >
          <input
            aria-label="Record URL"
            className="flex-1 rounded-md border border-rule bg-panel px-3 py-2 font-mono text-sm"
            value={recordUrl}
            onChange={(event) => setRecordUrl(event.target.value)}
          />
          <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm text-paper">
            Start recording
          </button>
        </form>
        {sessionId ? (
          <button type="button" className="mt-2 underline" onClick={() => stopRecord.mutate()}>
            Stop recording
          </button>
        ) : null}
        {unmatched.length > 0 ? (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="text-mute">
                <th className="py-1">Field</th>
                <th>Value</th>
                <th>Classify as</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.map((item) => (
                <tr key={`${item.name}-${item.value}`} className="border-t border-rule">
                  <td className="py-1">{item.name}</td>
                  <td>{item.value}</td>
                  <td>answer bank / literal / profile gap</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
}
