import type { Lead, LeadInsight } from "@prisma/client";
import { firstName } from "./phone";

type TemplateContext = {
  lead: Pick<Lead, "fullName" | "childName" | "interest" | "ageGroup">;
  insight?: Pick<LeadInsight, "recommendedProgram"> | null;
  studioName: string;
  signature: string;
  bookingLink: string;
};

/**
 * Fills `{{placeholders}}` in a step template. Unknown placeholders and empty values collapse to
 * sensible defaults so an automated text never goes out with a literal `{{name}}` in it.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  const { lead, insight, studioName, signature, bookingLink } = context;
  const values: Record<string, string> = {
    firstName: firstName(lead.fullName),
    fullName: lead.fullName,
    studio: studioName,
    signature,
    bookingLink,
    childName: lead.childName ?? "your child",
    who: lead.ageGroup === "KID" ? (lead.childName ?? "your child") : "you",
    program: insight?.recommendedProgram || lead.interest || "our beginner classes",
    interest: lead.interest || "getting started in martial arts",
  };

  return template
    .replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)
    .replace(/[ \t]+/g, " ")
    .trim();
}

export const SMS_CHARACTER_BUDGET = 320;

export function truncateForSms(body: string): string {
  if (body.length <= SMS_CHARACTER_BUDGET) return body;
  return `${body.slice(0, SMS_CHARACTER_BUDGET - 1).trimEnd()}…`;
}
