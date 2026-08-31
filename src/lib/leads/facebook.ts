import crypto from "crypto";
import type { CreateLeadInput } from "./engine";

export type GraphFieldData = { name: string; values: string[] };

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v21.0";

export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.FB_APP_SECRET;
  if (!secret) return true; // unconfigured: accept (used for local testing before the app is live)
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = header.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function fetchLeadFromGraph(leadgenId: string): Promise<{
  fieldData: GraphFieldData[];
  createdTime?: string;
  formName?: string;
  campaignName?: string;
}> {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("FB_PAGE_ACCESS_TOKEN is not set, so lead details can't be fetched.");
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", "field_data,created_time,form_name,campaign_name");
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as {
    field_data?: GraphFieldData[];
    created_time?: string;
    form_name?: string;
    campaign_name?: string;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Graph API responded ${response.status}`);
  }
  return {
    fieldData: payload.field_data ?? [],
    createdTime: payload.created_time,
    formName: payload.form_name,
    campaignName: payload.campaign_name,
  };
}

const NAME_KEYS = ["full_name", "fullname", "name", "first_name"];
const PHONE_KEYS = ["phone_number", "phone", "mobile", "mobile_number"];
const EMAIL_KEYS = ["email", "email_address"];
const CHILD_KEYS = ["child_name", "childs_name", "student_name", "kid_name"];
const INTEREST_HINTS = ["interest", "program", "goal", "looking", "class", "which", "what"];

function firstMatch(map: Map<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = map.get(key);
    if (value) return value;
  }
  return undefined;
}

/** Turns a Facebook lead form submission into lead intake input. */
export function mapGraphLead(
  leadgenId: string,
  fieldData: GraphFieldData[],
  meta: { createdTime?: string; formName?: string; campaignName?: string },
): CreateLeadInput {
  const map = new Map<string, string>();
  for (const field of fieldData) {
    const value = (field.values ?? []).join(", ").trim();
    if (value) map.set(field.name.toLowerCase(), value);
  }

  const lastName = map.get("last_name");
  const baseName = firstMatch(map, NAME_KEYS) ?? "Facebook lead";
  const fullName = lastName && !baseName.includes(lastName) ? `${baseName} ${lastName}` : baseName;
  const childName = firstMatch(map, CHILD_KEYS) ?? null;

  const answers: Record<string, string> = {};
  const interestParts: string[] = [];
  for (const [key, value] of Array.from(map.entries())) {
    if ([...NAME_KEYS, ...PHONE_KEYS, ...EMAIL_KEYS, ...CHILD_KEYS, "last_name"].includes(key)) continue;
    answers[key] = value;
    if (INTEREST_HINTS.some((hint) => key.includes(hint))) interestParts.push(value);
  }

  const answerText = Object.entries(answers)
    .map(([k, v]) => `${k} ${v}`)
    .join(" ")
    .toLowerCase();
  const ageGroup = childName || /\b(kid|child|son|daughter|youth|teen)\b/.test(answerText)
    ? "KID"
    : /\b(adult|myself|me)\b/.test(answerText)
      ? "ADULT"
      : "UNKNOWN";

  return {
    fullName,
    phone: firstMatch(map, PHONE_KEYS) ?? "",
    email: firstMatch(map, EMAIL_KEYS) ?? null,
    source: "FACEBOOK_ADS",
    sourceRef: leadgenId,
    campaign: meta.campaignName ?? null,
    formName: meta.formName ?? null,
    interest: interestParts.join(" · ") || null,
    ageGroup,
    childName,
    answers,
    submittedAt: meta.createdTime ? new Date(meta.createdTime) : new Date(),
  };
}
