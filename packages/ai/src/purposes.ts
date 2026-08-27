import {
  ClassifyPageOutputSchema,
  CoverLetterOutputSchema,
  DistilledPageSchema,
  DraftAnswerOutputSchema,
  MapOptionOutputSchema,
  RepairPatchSchema,
  ResolveLabelsOutputSchema,
  type DistilledPage,
  type PageClass,
  type RepairPatch,
} from "@autoapply/core";
import { invokePurpose, requirePage, type AiHandle } from "./runtime.ts";

export async function classifyPage(handle: AiHandle, page: DistilledPage): Promise<PageClass> {
  const out = await invokePurpose(handle, "classify_page", page, ClassifyPageOutputSchema);
  return out.class;
}

export async function resolveLabels(
  handle: AiHandle,
  page: DistilledPage,
): Promise<Array<{ id: string; label: string }>> {
  const unlabeled = DistilledPageSchema.parse({
    ...requirePage(page),
    fields: page.fields.filter((field) => field.label === null),
  });
  if (unlabeled.fields.length === 0) {
    return [];
  }
  const out = await invokePurpose(handle, "resolve_labels", unlabeled, ResolveLabelsOutputSchema);
  return out.labels;
}

export async function mapOption(
  handle: AiHandle,
  page: DistilledPage,
  input: { canonical: string; options: string[] },
): Promise<number | null> {
  const out = await invokePurpose(
    handle,
    "map_option",
    page,
    MapOptionOutputSchema,
    `CANONICAL: ${input.canonical}\nOPTIONS: ${input.options.map((item, index) => `${index}:${item}`).join(" | ")}`,
  );
  return out.index;
}

export async function repairStep(
  handle: AiHandle,
  page: DistilledPage,
  input: { fieldId: string; error: string; attempted?: string },
): Promise<RepairPatch> {
  return invokePurpose(
    handle,
    "repair_step",
    page,
    RepairPatchSchema,
    `FAILED_FIELD: ${input.fieldId}\nERROR: ${input.error}${input.attempted ? `\nATTEMPTED_PRESENT: yes` : ""}`,
  );
}

export async function draftAnswer(
  handle: AiHandle,
  page: DistilledPage,
  input: { question: string; profileContext: string; jobContext: string },
): Promise<{ draft: string; needsApproval: true }> {
  return invokePurpose(
    handle,
    "draft_answer",
    page,
    DraftAnswerOutputSchema,
    `QUESTION: ${input.question}\nPROFILE: ${input.profileContext}\nJOB: ${input.jobContext}`,
  );
}

export async function writeCoverLetter(
  handle: AiHandle,
  page: DistilledPage,
  input: { jobDescription: string; resumeVariant: string },
): Promise<string> {
  const out = await invokePurpose(
    handle,
    "write_cover_letter",
    page,
    CoverLetterOutputSchema,
    `JOB: ${input.jobDescription}\nRESUME: ${input.resumeVariant}`,
  );
  return out.letter;
}
