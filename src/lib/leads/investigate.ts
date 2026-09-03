import type { Lead, LeadMessage } from "@prisma/client";
import { prisma } from "../db";
import { firstName } from "./phone";
import { getBotConfig } from "./config";
import { callLlm, llmConfigured, parseJsonObject } from "./llm";

export type Investigation = {
  score: number;
  temperature: "HOT" | "WARM" | "COLD";
  summary: string;
  intent: string;
  objections: string[];
  talkingPoints: string[];
  recommendedProgram: string;
  suggestedFirstText: string;
  generatedBy: "AI" | "RULES";
  model: string | null;
};

type LeadForInvestigation = Lead & { messages: LeadMessage[] };

const URGENT_WORDS = ["asap", "this week", "today", "tomorrow", "right away", "immediately", "now"];
const PRICE_WORDS = ["price", "pricing", "cost", "how much", "cheap", "afford", "budget"];
const READY_WORDS = ["sign up", "signup", "enroll", "register", "join", "trial", "book", "start"];

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function answerText(lead: Lead): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(lead.answers);
  } catch {
    parsed = null;
  }
  const lines: string[] = [];
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.join("\n");
}

function haystack(lead: LeadForInvestigation): string {
  return [
    lead.interest ?? "",
    lead.notes,
    lead.campaign ?? "",
    lead.formName ?? "",
    answerText(lead),
    ...lead.messages.filter((m) => m.direction === "INBOUND").map((m) => m.body),
  ]
    .join("\n")
    .toLowerCase();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

async function programNames(): Promise<string[]> {
  const programs = await prisma.program.findMany({ select: { name: true } });
  return programs.map((p) => p.name);
}

function pickProgram(lead: LeadForInvestigation, programs: string[]): string {
  const text = haystack(lead);
  const direct = programs.find((name) => text.includes(name.toLowerCase()));
  if (direct) return direct;

  const byKeyword: [string[], string][] = [
    [["kid", "child", "son", "daughter", "youth", "5 year", "7 year"], "Kids"],
    [["compete", "competition", "tournament", "spar"], "Competition"],
    [["fitness", "weight", "conditioning", "shape"], "Fitness"],
    [["self defense", "self-defense", "defense", "safety"], "Self Defense"],
    [["jiu", "bjj", "grappling", "wrestl"], "Jiu"],
    [["muay", "kickbox", "striking", "boxing"], "Muay"],
  ];
  for (const [keywords, fragment] of byKeyword) {
    if (!includesAny(text, keywords)) continue;
    const match = programs.find((name) => name.toLowerCase().includes(fragment.toLowerCase()));
    if (match) return match;
  }
  if (lead.ageGroup === "KID") {
    const kids = programs.find((name) => name.toLowerCase().includes("kid"));
    if (kids) return kids;
  }
  return programs[0] ?? "Beginner classes";
}

/** Deterministic qualification used when no LLM key is configured (and as the AI fallback). */
function investigateWithRules(
  lead: LeadForInvestigation,
  programs: string[],
  studioName: string,
): Investigation {
  const text = haystack(lead);
  const age = daysSince(lead.submittedAt);
  const replied = lead.messages.some((m) => m.direction === "INBOUND");

  let score = 45;
  const reasons: string[] = [];

  if (age <= 1) {
    score += 20;
    reasons.push("submitted within the last day, so interest is still fresh");
  } else if (age <= 7) {
    score += 10;
    reasons.push(`submitted ${age} day${age === 1 ? "" : "s"} ago`);
  } else if (age <= 60) {
    score -= 5;
    reasons.push(`${age} days old — needs a reactivation angle, not a "thanks for enquiring" text`);
  } else {
    score -= 15;
    reasons.push(`${age} days old, likely forgot the original ad`);
  }

  if (replied) {
    score += 20;
    reasons.push("already replied by text");
  }
  if (includesAny(text, READY_WORDS)) {
    score += 12;
    reasons.push("used sign-up language");
  }
  if (includesAny(text, URGENT_WORDS)) {
    score += 10;
    reasons.push("wants to start soon");
  }
  if (lead.email) score += 4;
  if (lead.ageGroup === "KID") {
    score += 6;
    reasons.push("parent enquiring for a child, which converts well on a trial class");
  }
  if (lead.source === "FACEBOOK_ADS") score += 4;
  if (lead.status === "BOOKED" || lead.status === "WON") score += 10;
  if (lead.status === "LOST" || lead.optedOutAt) score -= 30;

  score = Math.max(1, Math.min(99, score));
  const temperature: Investigation["temperature"] = score >= 70 ? "HOT" : score >= 40 ? "WARM" : "COLD";

  const objections: string[] = [];
  if (includesAny(text, PRICE_WORDS)) objections.push("Asked about price — lead with the free trial, not the rate.");
  if (age > 30) objections.push("Cold lead: re-introduce the studio before asking for anything.");
  if (lead.ageGroup === "KID") objections.push("Parents want schedule fit and safety, not technique detail.");
  if (objections.length === 0) objections.push("No stated objection yet — ask an open question to surface one.");

  const recommendedProgram = pickProgram(lead, programs);
  const who = lead.ageGroup === "KID" ? (lead.childName ?? "their child") : "them";
  const youOrChild = lead.ageGroup === "KID" ? (lead.childName ?? "your child") : "you";
  const talkingPoints = [
    `Offer a specific trial slot for ${recommendedProgram} rather than asking "when works?"`,
    `Reference what they asked for: ${lead.interest || lead.formName || "the Facebook ad"}.`,
    `Confirm whether the class is for ${who}, and their experience level.`,
  ];

  const name = firstName(lead.fullName);
  const suggestedFirstText =
    age > 30
      ? `Hi ${name}, it's ${studioName}. You reached out to us a while back and we just opened new beginner spots in ${recommendedProgram}. Want me to hold one for ${youOrChild} this week? Reply STOP to opt out.`
      : `Hi ${name}, thanks for reaching out to ${studioName}! I can get ${youOrChild} into a free ${recommendedProgram} class this week. Does a weeknight or Saturday work better? Reply STOP to opt out.`;

  return {
    score,
    temperature,
    summary: `${temperature} lead (${score}/100): ${reasons.join("; ")}.`,
    intent: lead.interest || (lead.ageGroup === "KID" ? "Classes for a child" : "Adult classes"),
    objections,
    talkingPoints,
    recommendedProgram,
    suggestedFirstText,
    generatedBy: "RULES",
    model: null,
  };
}

function buildPrompt(lead: LeadForInvestigation, programs: string[], studioName: string): string {
  const conversation = lead.messages
    .map((m) => `${m.direction === "INBOUND" ? "Lead" : "Studio"}: ${m.body}`)
    .join("\n");
  return [
    `You qualify inbound leads for ${studioName}, a martial arts studio.`,
    "Judge how likely this lead is to buy a membership and how the studio should follow up by SMS.",
    "",
    `Programs offered: ${programs.join(", ") || "beginner martial arts classes"}`,
    "",
    "Lead:",
    `- Name: ${lead.fullName}`,
    `- Source: ${lead.source}${lead.campaign ? ` (campaign: ${lead.campaign})` : ""}`,
    `- Submitted: ${lead.submittedAt.toISOString()} (${daysSince(lead.submittedAt)} days ago)`,
    `- Age group: ${lead.ageGroup}${lead.childName ? ` (child: ${lead.childName})` : ""}`,
    `- Stated interest: ${lead.interest ?? "unknown"}`,
    `- Form answers: ${answerText(lead) || "none"}`,
    `- Staff notes: ${lead.notes || "none"}`,
    "",
    `Text conversation so far:\n${conversation || "none yet"}`,
    "",
    "Reply with JSON only, no prose, matching:",
    '{"score": 0-100, "temperature": "HOT"|"WARM"|"COLD", "summary": string, "intent": string,',
    ' "objections": string[], "talkingPoints": string[], "recommendedProgram": string, "suggestedFirstText": string}',
    "",
    "suggestedFirstText must be under 300 characters, friendly, name the program, propose a concrete next step,",
    'and end with "Reply STOP to opt out." since it is the first message this lead receives.',
  ].join("\n");
}

function coerceInvestigation(
  raw: string,
  fallback: Investigation,
  generatedBy: "AI",
  model: string,
): Investigation {
  const parsed = parseJsonObject(raw);
  if (!parsed) return fallback;

  const stringList = (value: unknown, fallbackList: string[]): string[] =>
    Array.isArray(value) && value.length > 0 ? value.map((v) => String(v)) : fallbackList;
  const score = Number(parsed.score);
  const temperature = String(parsed.temperature ?? "").toUpperCase();

  return {
    score: Number.isFinite(score) ? Math.max(1, Math.min(99, Math.round(score))) : fallback.score,
    temperature:
      temperature === "HOT" || temperature === "WARM" || temperature === "COLD"
        ? temperature
        : fallback.temperature,
    summary: String(parsed.summary ?? fallback.summary),
    intent: String(parsed.intent ?? fallback.intent),
    objections: stringList(parsed.objections, fallback.objections),
    talkingPoints: stringList(parsed.talkingPoints, fallback.talkingPoints),
    recommendedProgram: String(parsed.recommendedProgram ?? fallback.recommendedProgram),
    suggestedFirstText: String(parsed.suggestedFirstText ?? fallback.suggestedFirstText),
    generatedBy,
    model,
  };
}

/** Re-exported so UI readiness checks keep a single import for "is the AI wired up?". */
export { llmConfigured };

/**
 * Investigates a lead: scores it, works out what they actually want, and drafts the opener.
 * Uses an LLM when a key is available and always falls back to the deterministic rules so the
 * follow-up cadence never stalls on a provider outage.
 */
export async function investigateLead(leadId: string): Promise<Investigation> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  const programs = await programNames();
  const config = await getBotConfig();
  const rules = investigateWithRules(lead, programs, config.studioName);

  if (!llmConfigured()) return rules;

  const prompt = buildPrompt(lead, programs, config.studioName);
  const response = await callLlm({ prompt, json: true, temperature: 0.3 });
  if (response) return coerceInvestigation(response.text, rules, "AI", response.model);
  return rules;
}

export async function saveInvestigation(leadId: string, investigation: Investigation) {
  const data = {
    score: investigation.score,
    temperature: investigation.temperature,
    summary: investigation.summary,
    intent: investigation.intent,
    objections: investigation.objections.join("\n"),
    talkingPoints: investigation.talkingPoints.join("\n"),
    recommendedProgram: investigation.recommendedProgram,
    suggestedFirstText: investigation.suggestedFirstText,
    generatedBy: investigation.generatedBy,
    model: investigation.model,
  };
  return prisma.leadInsight.upsert({
    where: { leadId },
    update: data,
    create: { leadId, ...data },
  });
}

export async function investigateAndSave(leadId: string) {
  const investigation = await investigateLead(leadId);
  const insight = await saveInvestigation(leadId, investigation);
  await prisma.leadEvent.create({
    data: {
      leadId,
      type: "INVESTIGATED",
      summary: `Investigated: ${investigation.temperature} lead, score ${investigation.score}/100`,
      detail: `${investigation.generatedBy === "AI" ? `AI (${investigation.model})` : "Rules engine"} — ${investigation.summary}`,
    },
  });
  return insight;
}
