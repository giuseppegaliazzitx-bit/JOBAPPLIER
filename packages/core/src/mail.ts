import { z } from "zod";
import type { ApplicationStatus } from "./status.ts";
import { stripTags } from "./normalize.ts";

export const MailKindSchema = z.enum([
  "verification_code",
  "application_confirmation",
  "viewed_notification",
  "screening_request",
  "interview_invite",
  "rejection",
  "offer",
]);
export type MailKind = z.infer<typeof MailKindSchema>;

export const MailMessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  subject: z.string(),
  text: z.string().optional(),
  html: z.string().optional(),
  occurredAt: z.string().min(1),
});
export type MailMessage = z.infer<typeof MailMessageSchema>;

export const MailClassificationSchema = z.object({
  kind: MailKindSchema.nullable(),
  confidence: z.enum(["rule", "model", "none"]),
  verificationCode: z.string().optional(),
});
export type MailClassification = z.infer<typeof MailClassificationSchema>;

export const StatusSourceSchema = z.enum(["submit", "mail", "manual", "system"]);
export type StatusSource = z.infer<typeof StatusSourceSchema>;

export const FOLLOW_UP_SILENCE_DAYS = 7;
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const KIND_STATUS: Record<MailKind, ApplicationStatus | null> = {
  verification_code: null,
  application_confirmation: "applied",
  viewed_notification: "viewed",
  screening_request: "screening",
  interview_invite: "interview",
  rejection: "rejected",
  offer: "offer",
};

const STATUS_RANK: Record<ApplicationStatus, number> = {
  applied: 0,
  viewed: 1,
  screening: 2,
  interview: 3,
  offer: 4,
  ghosted: 5,
  rejected: 6,
};

const RULES: Array<{ kind: MailKind; patterns: RegExp[] }> = [
  {
    kind: "verification_code",
    patterns: [/verification code/i, /one-time code/i, /\botp\b/i, /your code is\s+\d{4,8}/i],
  },
  {
    kind: "offer",
    patterns: [/pleased to offer/i, /offer letter/i, /job offer/i, /compensation package/i],
  },
  {
    kind: "rejection",
    patterns: [
      /we regret/i,
      /not moving forward/i,
      /other candidates/i,
      /will not be progressing/i,
      /unfortunately.{0,80}(unable|not selected|will not)/i,
    ],
  },
  {
    kind: "interview_invite",
    patterns: [
      /interview invit/i,
      /schedule (?:your|an) interview/i,
      /calendar invite/i,
      /interview is scheduled/i,
    ],
  },
  {
    kind: "screening_request",
    patterns: [/phone screen/i, /recruiter screen/i, /hirevue/i, /coding challenge/i, /assessment request/i],
  },
  {
    kind: "viewed_notification",
    patterns: [
      /application was viewed/i,
      /has viewed your application/i,
      /your application has been viewed/i,
    ],
  },
  {
    kind: "application_confirmation",
    patterns: [
      /application received/i,
      /thank you for applying/i,
      /we have received your application/i,
    ],
  },
];

export function mailPlainText(message: Pick<MailMessage, "text" | "html">): string {
  if (message.text && message.text.trim().length > 0) {
    return message.text;
  }
  if (message.html) {
    return stripTags(message.html);
  }
  return "";
}

export function extractVerificationCode(text: string): string | undefined {
  const labeled = text.match(/(?:code is|code:|otp:)\s*([0-9]{4,8})/i);
  if (labeled?.[1]) {
    return labeled[1];
  }
  const standalone = text.match(/\b([0-9]{6})\b/);
  return standalone?.[1];
}

export function extractInterviewAt(text: string): string | undefined {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/);
  if (!iso?.[1]) {
    return undefined;
  }
  const time = iso[2] ? `${iso[2].padStart(5, "0")}:00` : "09:00:00";
  const stamp = `${iso[1]}T${time}.000Z`;
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function classifyMail(message: MailMessage): MailClassification {
  const hay = `${message.subject}\n${mailPlainText(message)}`;
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(hay))) {
      return {
        kind: rule.kind,
        confidence: "rule",
        verificationCode: rule.kind === "verification_code" ? extractVerificationCode(hay) : undefined,
      };
    }
  }
  return { kind: null, confidence: "none" };
}

export function statusForMailKind(kind: MailKind): ApplicationStatus | null {
  return KIND_STATUS[kind];
}

export function applyMailTransition(input: {
  current: ApplicationStatus;
  sourceOfStatus: string;
  kind: MailKind;
}): { next: ApplicationStatus; changed: boolean; reason: string } {
  if (input.sourceOfStatus === "manual") {
    return { next: input.current, changed: false, reason: "manual_override" };
  }
  const mapped = statusForMailKind(input.kind);
  if (!mapped) {
    return { next: input.current, changed: false, reason: "no_status" };
  }
  if (mapped === input.current) {
    return { next: input.current, changed: false, reason: "same" };
  }
  if (mapped === "rejected" || mapped === "offer") {
    return { next: mapped, changed: true, reason: "mail" };
  }
  if (input.current === "rejected" || input.current === "offer") {
    return { next: input.current, changed: false, reason: "terminal" };
  }
  if (STATUS_RANK[mapped] > STATUS_RANK[input.current]) {
    return { next: mapped, changed: true, reason: "mail" };
  }
  return { next: input.current, changed: false, reason: "no_downgrade" };
}

export function isSilentSince(updatedAt: string, now: Date, days = FOLLOW_UP_SILENCE_DAYS): boolean {
  const then = new Date(updatedAt).getTime();
  if (Number.isNaN(then)) {
    return false;
  }
  return now.getTime() - then >= days * 24 * 60 * 60 * 1000;
}

export function gmailAuthUrl(options: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", options.state);
  return url.toString();
}

export const ClassifyMailResultSchema = z.object({ kind: MailKindSchema });
export type ClassifyMailResult = z.infer<typeof ClassifyMailResultSchema>;
