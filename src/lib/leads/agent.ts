import type { KnowledgeItem, Lead, LeadInsight, LeadMessage } from "@prisma/client";
import { prisma } from "../db";
import { getBotConfig, type BotSettings } from "./config";
import { knowledgeForLead, renderKnowledge } from "./knowledge";
import { callLlm, llmConfigured, parseJsonObject } from "./llm";
import { firstName } from "./phone";
import { truncateForSms } from "./templates";

export const AGENT_ACTIONS = ["ANSWER", "BOOK", "UPSELL", "HANDOFF"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

export type AgentReply = {
  body: string;
  action: AgentAction;
  /** Class the message commits the lead to, booked for real when the text goes out. */
  sessionId: string | null;
  reason: string;
  generatedBy: "AI" | "RULES";
  model: string | null;
};

/**
 * How the agent is meant to sell. This is the relational-selling half of the prompt: the studio
 * is selling a habit someone keeps for years, so trust compounds and pressure destroys it.
 */
const SELLING_PLAYBOOK = [
  "Sell the way a good front-desk coach does, not the way a script does:",
  "- Diagnose before you prescribe. You cannot recommend a program until you know who is training, their goal, and what has stopped them before.",
  "- Ask exactly one question per text, and make it easy to answer (a choice of two beats an open question).",
  "- Mirror their own words back. If they said 'confidence', talk about confidence, not 'discipline and respect'.",
  "- Treat an objection as information, not resistance. Acknowledge it in their words first, answer it plainly, then offer a next step.",
  "- Propose a specific class time rather than asking 'when works for you?'. Concrete beats open.",
  "- Never pitch twice in a row. If they went quiet after an offer, ask a question instead of repeating it.",
  "- If they say no or 'not right now', accept it warmly and leave the door open. Do not counter-offer.",
  "- Match their message length and register. Short text, short reply. No exclamation-mark spam, no emoji unless they use them.",
  "- People buy from people. Reference what they told you earlier in the thread so it never reads as a broadcast.",
].join("\n");

const HARD_RULES = [
  "Absolute rules, these override everything else:",
  "- Never state a price, class time, schedule, promotion or policy that is not written in the STUDIO FACTS below. If you need one that is missing, use the HANDOFF action.",
  "- Never claim the lead said or did something they did not.",
  "- Never promise a coach will call at a specific time.",
  "- Never discuss injuries, medical advice, or another student.",
  "- Keep the text under 300 characters.",
  "- Do not add an opt-out line: the system adds it where it is required.",
  "- If the lead is upset, asks for a human, asks something the facts do not cover, or is negotiating money, use HANDOFF and write a short holding message.",
  "- Children's rates depend on how many days a week the family wants, so never quote one. Ask what schedule suits them and hand off for the coach to price it.",
  "- Never negotiate, discount or agree to a budget. Any haggling is a HANDOFF.",
].join("\n");

type AgentLead = Lead & { messages: LeadMessage[]; insight: LeadInsight | null };

const PRIVATE_PROGRAM = "Private Training";

/** Real upcoming classes, so "Tuesday 6pm" is a fact rather than a guess. */
export async function upcomingClasses(
  program: string,
  ageGroup: string,
  timezone: string,
  take = 6,
) {
  const audience = ageGroup === "KID" ? ["KIDS", "ALL"] : ["ADULTS", "ALL"];
  const sessions = await prisma.classSession.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { gte: new Date() },
      template: {
        ageGroup: { in: audience },
        // Privates are quoted and scheduled by a coach, never handed out as a trial slot.
        program: {
          name: {
            not: PRIVATE_PROGRAM,
            ...(program ? { contains: program, mode: "insensitive" } : {}),
          },
        },
      },
    },
    include: { template: { include: { program: true } } },
    orderBy: { startsAt: "asc" },
    take,
  });

  return sessions.map((session) => ({
    id: session.id,
    label: `${session.template.name} — ${new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(session.startsAt)} with ${session.instructor}`,
  }));
}

function conversationTranscript(messages: LeadMessage[]): string {
  return messages
    .filter((message) => message.status !== "DRAFT")
    .slice(-20)
    .map((message) => `${message.direction === "INBOUND" ? "Lead" : "Studio"}: ${message.body}`)
    .join("\n");
}

function leadBrief(lead: AgentLead): string {
  return [
    `- Name: ${lead.fullName} (call them ${firstName(lead.fullName)})`,
    `- Training for: ${lead.ageGroup === "KID" ? `their child${lead.childName ? ` ${lead.childName}` : ""}` : lead.ageGroup === "ADULT" ? "themselves" : "unknown — find out"}`,
    `- Stated interest: ${lead.interest || "not stated"}`,
    `- Status: ${lead.status}`,
    `- Came from: ${lead.source}${lead.campaign ? ` (${lead.campaign})` : ""}`,
    lead.insight ? `- Qualification: ${lead.insight.temperature}, ${lead.insight.summary}` : "",
    lead.insight?.objections ? `- Likely objections: ${lead.insight.objections.replace(/\n/g, "; ")}` : "",
    lead.notes ? `- Staff notes: ${lead.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAgentPrompt(input: {
  lead: AgentLead;
  config: BotSettings;
  facts: string;
  classes: { id: string; label: string }[];
  goal: string;
}): string {
  const { lead, config, facts, classes, goal } = input;
  return [
    `${config.agentPersona}`,
    `You are texting a lead for ${config.studioName}, a martial arts studio in Medina, Minnesota teaching Brazilian Jiu-Jitsu, Muay Thai and Judo to kids and adults.`,
    "",
    `YOUR GOAL RIGHT NOW: ${goal}`,
    "",
    SELLING_PLAYBOOK,
    "",
    HARD_RULES,
    "",
    "STUDIO FACTS (the only things you may state as fact):",
    facts || "none recorded — you may not state any specifics; hand off instead",
    "",
    classes.length > 0
      ? `UPCOMING CLASSES you may offer by name and time:\n${classes.map((c) => `- [${c.id}] ${c.label}`).join("\n")}`
      : "UPCOMING CLASSES: none are loaded, so do not name a day or time; offer to have a coach confirm one.",
    "",
    "THE LEAD:",
    leadBrief(lead),
    "",
    `CONVERSATION SO FAR (most recent last):\n${conversationTranscript(lead.messages) || "no messages yet"}`,
    "",
    "Reply with JSON only:",
    '{"message": string, "action": "ANSWER"|"BOOK"|"UPSELL"|"HANDOFF", "sessionId": string|null, "reason": string}',
    "",
    "message is the exact SMS to send. reason is one short line for staff explaining your read of the lead.",
    'Use "BOOK" when your message proposes or confirms a specific class, "UPSELL" when the lead already trains,',
    '"HANDOFF" when a human must take over.',
    "sessionId is the bracketed id of the class your message commits them to — set it only when the lead has",
    "agreed to a time or you are confirming one, never when you are merely suggesting. Otherwise null.",
    "When it is set, the class is booked for them, so the message may say they are booked in.",
  ].join("\n");
}

const MONEY = /\$\s?\d/;
/** Someone pushing on price: a coach owns that conversation, not the agent. */
const NEGOTIATION =
  /\b(discount|cheaper|cheapest|too expensive|can'?t afford|budget|deal|special rate|price match|payment plan|scholarship|free month|waive)\b|\bcan you do \$/i;
/** The lead saying yes to a time, which is what turns a proposal into a real booking. */
const AGREEMENT =
  /\b(yes|yep|yeah|yup|sure|ok|okay|sounds good|that works|works for (me|us|him|her)|perfect|great|let'?s do it|see you|book (us|him|her|me|it)|sign (him|her|us|me) up|we'?ll be there|i'?ll be there)\b/i;
const CLOCK = /\b\d{1,2}\s?(?::\d{2})?\s?(?:am|pm)\b/i;
const WEEKDAY = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/**
 * Blocks the one failure mode that actually costs the studio money: the agent inventing a price
 * or a class time. Any money, clock time or weekday in the draft has to trace back to a fact we
 * gave it, otherwise the message becomes a handoff.
 */
export function verifyAgainstFacts(
  message: string,
  facts: string,
): { ok: true } | { ok: false; violation: string } {
  const corpus = facts.toLowerCase();

  const money = message.match(new RegExp(MONEY.source + "[\\d,.]*", "g")) ?? [];
  for (const amount of money) {
    const digits = amount.replace(/[^\d.]/g, "");
    if (!corpus.includes(digits)) return { ok: false, violation: `quoted ${amount}, which is not in the knowledge base` };
  }

  const clock = message.match(new RegExp(CLOCK.source, "gi")) ?? [];
  for (const time of clock) {
    const normalized = time.toLowerCase().replace(/\s/g, "");
    if (!corpus.replace(/\s/g, "").includes(normalized)) {
      return { ok: false, violation: `named the time ${time}, which is not a real class slot` };
    }
  }

  const weekdays = message.match(new RegExp(WEEKDAY.source, "gi")) ?? [];
  for (const day of weekdays) {
    if (!corpus.includes(day.toLowerCase())) {
      return { ok: false, violation: `named ${day}, which is not in the schedule we gave it` };
    }
  }

  return { ok: true };
}

/**
 * The lead has to have said yes before a booking is real. Without this the model happily attaches
 * a `sessionId` to "how about Monday 6:15?", which would book someone who never agreed.
 */
function acceptedAnOffer(messages: LeadMessage[]): boolean {
  const lastInbound = [...messages].reverse().find((m) => m.direction === "INBOUND");
  if (!lastInbound) return false;
  return AGREEMENT.test(lastInbound.body) || CLOCK.test(lastInbound.body) || WEEKDAY.test(lastInbound.body);
}

function fallbackReply(lead: AgentLead, config: BotSettings): AgentReply {
  const name = firstName(lead.fullName);
  const lastInbound = [...lead.messages].reverse().find((m) => m.direction === "INBOUND");
  const asked = (lastInbound?.body ?? "").toLowerCase();
  const wantsPrice = ["price", "cost", "how much", "rate"].some((w) => asked.includes(w));

  if (wantsPrice) {
    return {
      body: `Good question ${name} — let me get you the exact rate rather than guess. A coach will text you the pricing shortly, and your first class is free either way.`,
      action: "HANDOFF",
      sessionId: null,
      reason: "Lead asked about price and no verified rate is in the knowledge base.",
      generatedBy: "RULES",
      model: null,
    };
  }
  return {
    body: `Thanks ${name} — got it. A coach at ${config.studioName} will follow up shortly to sort out a class time.`,
    action: "HANDOFF",
    sessionId: null,
    reason: "No LLM configured, so the agent acknowledged and handed off.",
    generatedBy: "RULES",
    model: null,
  };
}

/**
 * Writes the next text in a lead conversation. Falls back to a safe acknowledgement whenever the
 * model is unavailable or produces something it was not allowed to claim.
 */
export async function composeAgentReply(
  leadId: string,
  options: { goal?: string } = {},
): Promise<AgentReply> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { messages: { orderBy: { createdAt: "asc" } }, insight: true },
  });
  const config = await getBotConfig();

  if (!llmConfigured()) return fallbackReply(lead, config);

  const items: KnowledgeItem[] = await knowledgeForLead(lead);
  const facts = renderKnowledge(items);
  const classes = await upcomingClasses(
    lead.insight?.recommendedProgram ?? lead.interest ?? "",
    lead.ageGroup,
    config.timezone,
  );
  const goal =
    options.goal ??
    (lead.status === "WON"
      ? "Keep this member training and look for a natural upsell. Do not sell in every message."
      : "Move this lead to a booked free trial class, one small step at a time.");

  const response = await callLlm({
    prompt: buildAgentPrompt({ lead, config, facts, classes, goal }),
    json: true,
    temperature: 0.6,
    maxTokens: 500,
  });
  if (!response) return fallbackReply(lead, config);

  const parsed = parseJsonObject(response.text);
  const message = typeof parsed?.message === "string" ? parsed.message.trim() : "";
  if (!message) return fallbackReply(lead, config);

  const rawAction = String(parsed?.action ?? "ANSWER").toUpperCase();
  const action = (AGENT_ACTIONS as readonly string[]).includes(rawAction)
    ? (rawAction as AgentAction)
    : "ANSWER";
  const reason = typeof parsed?.reason === "string" ? parsed.reason : "";
  const claimedSession = typeof parsed?.sessionId === "string" ? parsed.sessionId : "";
  // Only ids we actually offered can be booked, so a hallucinated id books nothing.
  const offered = classes.some((c) => c.id === claimedSession) ? claimedSession : null;
  const sessionId = acceptedAnOffer(lead.messages) ? offered : null;

  const lastInbound = [...lead.messages].reverse().find((m) => m.direction === "INBOUND");
  const haggling = NEGOTIATION.test(lastInbound?.body ?? "");
  const quotesKidsRate = lead.ageGroup === "KID" && MONEY.test(message);
  if (haggling || quotesKidsRate) {
    return {
      body: `Thanks ${firstName(lead.fullName)} — let me get a coach to answer that one properly. They'll text you shortly.`,
      action: "HANDOFF",
      sessionId: null,
      reason: haggling
        ? "Lead is negotiating on price — a coach owns that conversation."
        : "Draft quoted a children's rate, which depends on the family's schedule.",
      generatedBy: "AI",
      model: response.model,
    };
  }

  const allowed = [facts, classes.map((c) => c.label).join("\n")].join("\n");
  const verdict = verifyAgainstFacts(message, allowed);
  if (!verdict.ok) {
    const fallback = fallbackReply(lead, config);
    return {
      ...fallback,
      action: "HANDOFF",
      sessionId: null,
      reason: `Draft withheld: the agent ${verdict.violation}.`,
      generatedBy: "AI",
      model: response.model,
    };
  }

  return {
    body: truncateForSms(message),
    action,
    sessionId: action === "BOOK" ? sessionId : null,
    reason,
    generatedBy: "AI",
    model: response.model,
  };
}
