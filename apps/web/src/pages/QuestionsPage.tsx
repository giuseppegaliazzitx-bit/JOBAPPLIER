import type { AnswerScope, QuestionCard } from "@autoapply/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QuestionControl } from "../QuestionControl.tsx";
import { answerQuestion, fetchCompleteness, fetchQuestions } from "../api.ts";

export function QuestionsPage() {
  const queryClient = useQueryClient();
  const questions = useQuery({
    queryKey: ["questions"],
    queryFn: fetchQuestions,
  });
  const completeness = useQuery({
    queryKey: ["completeness"],
    queryFn: fetchCompleteness,
  });
  const cards = questions.data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl">Questions</h1>
      <p className="mt-2 text-mute">
        Each control is the original. Nothing is guessed. One answer unblocks every job that asked it.
      </p>
      {(completeness.data?.gaps.length ?? 0) > 0 ? (
        <section className="mt-6 rounded-md border border-rule bg-panel p-4 text-sm">
          <h2 className="font-serif text-lg">Profile gaps</h2>
          <ul className="mt-2 list-disc pl-5">
            {completeness.data?.gaps.slice(0, 8).map((gap) => (
              <li key={gap.labelRaw}>
                {gap.labelRaw} ({gap.occurrences}×)
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {cards.length === 0 ? (
        <p className="mt-8 text-mute">The queue is empty. Nothing is guessed.</p>
      ) : (
        <ul className="mt-8 space-y-8">
          {cards.map((card) => (
            <li key={card.id} className="rounded-lg border border-rule bg-panel p-4">
              <QuestionCardForm
                card={card}
                onSaved={async () => {
                  await queryClient.invalidateQueries({ queryKey: ["questions"] });
                  await queryClient.invalidateQueries({ queryKey: ["completeness"] });
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionCardForm(props: { card: QuestionCard; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(
    props.card.answer?.canonicalValue ?? props.card.suggestion?.value ?? "",
  );
  const [scope, setScope] = useState<AnswerScope>(props.card.answer?.scope ?? "global");
  const save = useMutation({
    mutationFn: () =>
      answerQuestion(props.card.id, {
        canonicalValue: value,
        scope,
        chosenOption: props.card.options?.some((option) => option.value === value) ? value : undefined,
      }),
    onSuccess: () => props.onSaved(),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (value.length === 0) {
          return;
        }
        save.mutate();
      }}
    >
      <QuestionControl
        labelRaw={props.card.labelRaw}
        type={props.card.type}
        required={props.card.required}
        options={props.card.options}
        sectionHeading={props.card.sectionHeading}
        value={value}
        onChange={setValue}
        name={props.card.id}
      />
      {props.card.suggestion ? (
        <p className="mt-2 text-sm text-mute">
          Suggested from “{props.card.suggestion.matchedLabel}” (
          {props.card.suggestion.similarity.toFixed(2)}). Not filled until you approve.
        </p>
      ) : null}
      {props.card.blocked.length > 0 ? (
        <p className="mt-2 text-sm">
          Blocks {props.card.blocked.length} application
          {props.card.blocked.length === 1 ? "" : "s"}:{" "}
          {props.card.blocked.map((item) => item.title).join(", ")}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label>
          Scope{" "}
          <select
            className="rounded-md border border-rule bg-panel px-2 py-1"
            value={scope}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "global" || next === "company" || next === "job") {
                setScope(next);
              }
            }}
          >
            <option value="global">reuse everywhere</option>
            <option value="company">this company only</option>
            <option value="job">this job only</option>
          </select>
        </label>
        <button type="submit" className="rounded-md bg-ink px-3 py-1 text-paper" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save answer"}
        </button>
      </div>
    </form>
  );
}
