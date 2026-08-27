import { z } from "zod";

export const ProfileSectionSchema = z.enum([
  "identity",
  "work_authorization",
  "links",
  "work_history",
  "education",
  "skills",
]);

export type ProfileSection = z.infer<typeof ProfileSectionSchema>;

export const ProfileInputKindSchema = z.enum([
  "text",
  "email",
  "tel",
  "url",
  "select",
  "textarea",
  "json",
]);

export type ProfileInputKind = z.infer<typeof ProfileInputKindSchema>;

export const WorkHistoryEntrySchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  current: z.boolean().optional(),
  description: z.string().optional(),
});

export type WorkHistoryEntry = z.infer<typeof WorkHistoryEntrySchema>;

export const EducationEntrySchema = z.object({
  school: z.string().min(1),
  degree: z.string().optional(),
  field: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type EducationEntry = z.infer<typeof EducationEntrySchema>;

export const YesNoSchema = z.enum(["yes", "no"]);
export const EeoFillModeSchema = z.enum(["fill", "decline"]);

const selectOptions = {
  authorizedToWork: YesNoSchema.options,
  needsSponsorship: YesNoSchema.options,
  eeoFillMode: EeoFillModeSchema.options,
} as const;

export type ProfileFieldDef = {
  key: string;
  section: ProfileSection;
  label: string;
  input: ProfileInputKind;
  required: boolean;
  options?: readonly string[];
};

export const PROFILE_FIELDS = [
  { key: "firstName", section: "identity", label: "First name", input: "text", required: true },
  { key: "lastName", section: "identity", label: "Last name", input: "text", required: true },
  { key: "preferredName", section: "identity", label: "Preferred name", input: "text", required: false },
  { key: "email", section: "identity", label: "Email", input: "email", required: true },
  { key: "phone", section: "identity", label: "Phone", input: "tel", required: true },
  { key: "addressLine1", section: "identity", label: "Address line 1", input: "text", required: false },
  { key: "addressLine2", section: "identity", label: "Address line 2", input: "text", required: false },
  { key: "city", section: "identity", label: "City", input: "text", required: false },
  { key: "state", section: "identity", label: "State / region", input: "text", required: false },
  { key: "postalCode", section: "identity", label: "Postal code", input: "text", required: false },
  { key: "country", section: "identity", label: "Country", input: "text", required: true },
  {
    key: "authorizedToWork",
    section: "work_authorization",
    label: "Authorized to work in the US",
    input: "select",
    required: true,
    options: selectOptions.authorizedToWork,
  },
  {
    key: "needsSponsorship",
    section: "work_authorization",
    label: "Will you need sponsorship",
    input: "select",
    required: true,
    options: selectOptions.needsSponsorship,
  },
  {
    key: "eeoFillMode",
    section: "work_authorization",
    label: "EEO / voluntary self-ID questions",
    input: "select",
    required: true,
    options: selectOptions.eeoFillMode,
  },
  { key: "linkedin", section: "links", label: "LinkedIn", input: "url", required: false },
  { key: "github", section: "links", label: "GitHub", input: "url", required: false },
  { key: "portfolio", section: "links", label: "Portfolio", input: "url", required: false },
  { key: "website", section: "links", label: "Website", input: "url", required: false },
  { key: "workHistory", section: "work_history", label: "Work history", input: "json", required: false },
  { key: "education", section: "education", label: "Education", input: "json", required: false },
  { key: "skills", section: "skills", label: "Skills", input: "json", required: false },
] as const satisfies readonly ProfileFieldDef[];

export type ProfileKey = (typeof PROFILE_FIELDS)[number]["key"];

export function profileField(key: ProfileKey): (typeof PROFILE_FIELDS)[number] {
  const field = PROFILE_FIELDS.find((item) => item.key === key);
  if (!field) {
    throw new Error(`unknown profile key: ${key}`);
  }
  return field;
}

const optionalString = z.string();
const optionalUrl = z.union([z.literal(""), z.string().url()]);

export const ProfileValuesSchema = z.object({
  firstName: optionalString.optional(),
  lastName: optionalString.optional(),
  preferredName: optionalString.optional(),
  email: z.union([z.literal(""), z.string().email()]).optional(),
  phone: optionalString.optional(),
  addressLine1: optionalString.optional(),
  addressLine2: optionalString.optional(),
  city: optionalString.optional(),
  state: optionalString.optional(),
  postalCode: optionalString.optional(),
  country: optionalString.optional(),
  authorizedToWork: YesNoSchema.optional(),
  needsSponsorship: YesNoSchema.optional(),
  eeoFillMode: EeoFillModeSchema.optional(),
  linkedin: optionalUrl.optional(),
  github: optionalUrl.optional(),
  portfolio: optionalUrl.optional(),
  website: optionalUrl.optional(),
  workHistory: z.array(WorkHistoryEntrySchema).optional(),
  education: z.array(EducationEntrySchema).optional(),
  skills: z.array(z.string().min(1)).optional(),
});

export type ProfileValues = z.infer<typeof ProfileValuesSchema>;

const JSON_KEYS = new Set<ProfileKey>(["workHistory", "education", "skills"]);

export function isProfileKey(key: string): key is ProfileKey {
  return PROFILE_FIELDS.some((field) => field.key === key);
}

export function isJsonProfileKey(key: ProfileKey): boolean {
  return JSON_KEYS.has(key);
}

export function serializeProfileValue(key: ProfileKey, value: unknown): string {
  if (isJsonProfileKey(key)) {
    return JSON.stringify(value ?? []);
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

export function parseStoredProfileValue(key: ProfileKey, raw: string): unknown {
  if (isJsonProfileKey(key)) {
    if (raw.length === 0) {
      return [];
    }
    return JSON.parse(raw) as unknown;
  }
  return raw;
}

export function profileValuesFromStore(rows: Array<{ key: string; value: string }>): ProfileValues {
  const draft: Record<string, unknown> = {};
  for (const row of rows) {
    if (!isProfileKey(row.key)) {
      continue;
    }
    draft[row.key] = parseStoredProfileValue(row.key, row.value);
  }
  return ProfileValuesSchema.parse(draft);
}

export function requiredProfileKeys(): ProfileKey[] {
  return PROFILE_FIELDS.filter((field) => field.required).map((field) => field.key);
}
