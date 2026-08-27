import { normalizeQuestion } from "./question-normalize.ts";
import type { FieldType } from "./field.ts";
import type { ProfileKey } from "./profile.ts";

export const QUESTION_CLUSTERS: Record<string, string[]> = {
  work_auth: [
    "Are you authorized to work in the US?",
    "Do you have US work authorization?",
    "Are you legally authorized to work in the United States?",
    "Are you eligible to work in the United States?",
    "Do you have the right to work in the US?",
    "Are you legally authorized to work in the U.S.?",
    "Work authorization (US)",
    "Authorized to work in the United States?",
  ],
  sponsorship: [
    "Will you now or in the future require sponsorship?",
    "Will you require visa sponsorship?",
    "Do you need sponsorship to work in the US?",
    "Will you now or in the future require sponsorship to work in the United States?",
    "Do you require employer-sponsored work authorization?",
    "Need sponsorship now or in the future?",
  ],
  first_name: [
    "First Name",
    "Legal First Name",
    "Given name",
    "First name (legal)",
    "What's your first name?",
    "Please enter your first name",
  ],
  last_name: [
    "Last Name",
    "Legal Last Name",
    "Family name",
    "Surname",
    "Last name (legal)",
    "What's your last name?",
  ],
  email: [
    "Email",
    "Email Address",
    "E-mail",
    "Work email",
    "What's your email?",
    "Email address (required)",
  ],
  phone: [
    "Phone",
    "Phone Number",
    "Mobile Phone",
    "Cell phone",
    "Telephone",
    "Primary phone number",
  ],
  resume: [
    "Resume",
    "Resume/CV",
    "Attach Resume",
    "Upload your CV",
    "Curriculum Vitae",
    "Please attach your resume",
  ],
  cover_letter: [
    "Cover Letter",
    "Cover letter (optional)",
    "Please attach a cover letter",
    "Upload cover letter",
  ],
  linkedin: [
    "LinkedIn",
    "LinkedIn Profile",
    "LinkedIn URL",
    "Your LinkedIn profile",
    "Link to LinkedIn",
  ],
  github: [
    "GitHub",
    "GitHub URL",
    "GitHub profile",
    "Link to GitHub",
  ],
  salary: [
    "Desired salary",
    "Salary expectation",
    "Expected compensation",
    "What are your pay expectations?",
    "Compensation expectations",
  ],
  start_date: [
    "Start date",
    "When can you start?",
    "Earliest start date",
    "Available to start",
    "What is your notice period?",
  ],
  city: [
    "City",
    "City of residence",
    "What city do you live in?",
    "Current city",
  ],
  country: [
    "Country",
    "Country of residence",
    "What country do you live in?",
    "Current country",
  ],
  veteran: [
    "Veteran status",
    "Are you a veteran?",
    "Protected veteran status",
    "Veteran self-identification",
  ],
  disability: [
    "Disability status",
    "Do you have a disability?",
    "Disability self-identification",
    "Voluntary disability identification",
  ],
  gender: [
    "Gender",
    "Gender identity",
    "What is your gender?",
  ],
  race: [
    "Race",
    "Ethnicity",
    "Race / ethnicity",
    "Racial or ethnic identity",
  ],
  years_experience: [
    "Years of experience",
    "How many years of experience do you have?",
    "Years of relevant experience",
    "Total years of professional experience",
  ],
  relocate: [
    "Are you willing to relocate?",
    "Willing to relocate",
    "Would you relocate for this role?",
  ],
  travel: [
    "Are you willing to travel?",
    "Willing to travel",
    "Travel required — are you able to travel?",
  ],
  age18: [
    "Are you at least 18 years of age?",
    "Are you 18 years or older?",
    "I certify I am over 18",
  ],
  company_prior: [
    "Have you worked at {company} before?",
    "Have you previously been employed by this company?",
    "Former employee?",
  ],
  currently_employed: [
    "Are you currently employed?",
    "Currently working?",
    "Are you currently employed full-time?",
  ],
};

export const PROFILE_CLUSTERS: Partial<Record<ProfileKey, string>> = {
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
  city: "city",
  country: "country",
  authorizedToWork: "work_auth",
  needsSponsorship: "sponsorship",
  linkedin: "linkedin",
  github: "github",
};

const CLUSTER_BY_NORM = new Map<string, string>();
for (const [cluster, labels] of Object.entries(QUESTION_CLUSTERS)) {
  for (const label of labels) {
    CLUSTER_BY_NORM.set(normalizeQuestion(label), cluster);
  }
}

export function clusterFor(label: string, company?: string): string | null {
  return CLUSTER_BY_NORM.get(normalizeQuestion(label, company)) ?? null;
}

export function defaultTypeForCluster(cluster: string): FieldType {
  if (cluster === "resume" || cluster === "cover_letter") {
    return "file";
  }
  if (
    cluster === "work_auth" ||
    cluster === "sponsorship" ||
    cluster === "veteran" ||
    cluster === "disability" ||
    cluster === "gender" ||
    cluster === "relocate" ||
    cluster === "travel" ||
    cluster === "age18" ||
    cluster === "company_prior" ||
    cluster === "currently_employed"
  ) {
    return "select";
  }
  if (cluster === "email") {
    return "email";
  }
  if (cluster === "phone") {
    return "tel";
  }
  if (cluster === "linkedin" || cluster === "github") {
    return "url";
  }
  return "text";
}
