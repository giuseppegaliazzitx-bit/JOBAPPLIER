import type { AiPurpose } from "@autoapply/core";

export const PURPOSE_PROMPTS: Record<AiPurpose, string> = {
  classify_page: `You classify a job-application page from a distilled field list. Never invent fields.
Return JSON {"class":"login"|"form_step"|"review"|"confirmation"|"error"|"captcha"|"expired"}.`,
  resolve_labels: `You assign human labels to unlabeled fields on a distilled application page.
Return JSON {"labels":[{"id":"f1","label":"..." }]}. Only label ids present in the page. Never copy current values; there are none.`,
  map_option: `Map a canonical answer onto one option from the provided list.
Return JSON {"index": number|null} where index is 0-based, or null if none fit.`,
  repair_step: `Propose a selector patch for a failed form step. Use the distilled page only.
Return JSON {"selector":{"primary":{"strategy":"css"|"label"|"role"|"testid"|"name"|"placeholder"|"text","value":"..."},"fallbacks":[]},"action":"fill"|"click"|"select"|"upload","widget":"native"|"combobox"|"typeahead"|"react-select"|"rich-text"|"unknown"}.
The selector must match exactly one live control.`,
  draft_answer: `Draft an answer to an application question using profile and job context.
Return JSON {"draft":"...","needsApproval":true}. The draft is never submitted automatically.`,
  write_cover_letter: `Write a cover letter from the job description and resume variant.
Return JSON {"letter":"..."}.`,
  classify_mail: `Classify a job-application email from SUBJECT and TEXT only. Never use HTML.
Return JSON {"kind":"verification_code"|"application_confirmation"|"viewed_notification"|"screening_request"|"interview_invite"|"rejection"|"offer"}.`,
};

export const TIER_MODELS = {
  small: "grok-4-fast-non-reasoning",
  medium: "grok-4.5",
  large: "grok-4.5",
} as const;
