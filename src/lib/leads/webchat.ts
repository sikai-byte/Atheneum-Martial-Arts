import type { KnowledgeItem, WebChat, WebChatMessage } from "@prisma/client";
import { prisma } from "../db";
import { upcomingClasses, verifyAgainstFacts } from "./agent";
import { getBotConfig, type BotSettings } from "./config";
import { knowledgeForLead, renderKnowledge } from "./knowledge";
import { callLlm, llmConfigured, parseJsonObject } from "./llm";

/**
 * The website bot is the SMS sales agent behind a different front door: same knowledge base, same
 * real class rows, same fact checking. Three things differ, and they are the whole reason this file
 * exists rather than a `channel` flag on the agent:
 *
 * 1. The visitor is anonymous. There is no `Lead` to hang a conversation off until they hand over a
 *    phone number, and `Lead.phone` is required and unique.
 * 2. No consent exists yet, so nothing here may cause a text. Capture records consent; the send
 *    gate enforces it.
 * 3. The endpoint is public and every reply costs money, so the engine has to degrade gracefully
 *    when the studio's daily cap is hit instead of failing.
 */

export const CHAT_ACTIONS = ["ANSWER", "CAPTURE", "BOOK", "HANDOFF"] as const;
export type ChatAction = (typeof CHAT_ACTIONS)[number];

export type ChatReply = {
  body: string;
  action: ChatAction;
  /** Class the bot named, if any. A trial is only booked once we have contact details. */
  sessionId: string | null;
  reason: string;
  generatedBy: "AI" | "RULES";
  model: string | null;
};

/** The wording the widget must show above the consent checkbox, stored with every consent. */
export const SMS_CONSENT_TEXT =
  "By providing my phone number, I agree to receive text messages from Atheneum Martial Arts about " +
  "my inquiry, class information, scheduling, and appointment reminders. Messages may be sent up to " +
  "4 times per week. Msg & data rates may apply. Reply HELP for help or STOP to cancel.";

const WEB_RULES = [
  "Absolute rules, these override everything else:",
  "- Only state a price, class time, schedule, promotion or policy that is written in the STUDIO FACTS below. If what they need is missing, use HANDOFF.",
  "- Children's rates depend on how many days a week the family trains, so never quote one. Ask what schedule suits them and hand off so a coach can price it.",
  "- Never negotiate, discount or agree to a budget. Any haggling is a HANDOFF.",
  "- Never discuss injuries, medical advice, or another student.",
  "- We do not run an MMA class. If asked, say so plainly and offer BJJ or Muay Thai instead.",
  "- You are a chat widget on the studio's website, not a text message. Two or three sentences, no emoji unless they use them, and never ask for a phone number twice.",
  "- You cannot see the visitor's name unless they gave it. Do not invent one or claim they told you something they did not.",
].join("\n");

const WEB_PLAYBOOK = [
  "How to handle a website visitor:",
  "- Answer the question they actually asked, first and plainly. Nobody books a trial with an unanswered question in their head.",
  "- Then take one small step forward: a free trial class, or a coach getting in touch.",
  "- Diagnose before prescribing. Who is training, and what are they after? One question at a time.",
  "- Use CAPTURE once they show real intent (they ask about a trial, a time, or want a coach). Ask for a first name and a phone number or email so the studio can reach them, and say the trial is free.",
  "- Someone browsing is not a lead yet. Do not ask for contact details in your first reply unless they asked to be contacted.",
  "- If they are upset, want a human, or ask something the facts do not cover, use HANDOFF and say a coach will get back to them.",
].join("\n");

/** What the bot says when the studio's daily model budget is spent. Never a dead end. */
function cappedReply(config: BotSettings): ChatReply {
  return {
    body: `I'm not able to answer that one right now, but a coach at ${config.studioName} can — leave your name and a phone number or email and they'll get back to you shortly. Your first class is free either way.`,
    action: "CAPTURE",
    sessionId: null,
    reason: "Daily web chat model cap reached, so the bot collected contact details instead.",
    generatedBy: "RULES",
    model: null,
  };
}

function fallbackReply(config: BotSettings, asked: string): ChatReply {
  const wantsPrice = ["price", "cost", "how much", "rate", "fee"].some((word) =>
    asked.toLowerCase().includes(word),
  );
  return {
    body: wantsPrice
      ? `Rates depend on which programme and how many days a week you train, so I'd rather a coach gave you the exact number than guess. Leave your name and a phone number or email and they'll get back to you — your first class is free either way.`
      : `Happy to help — a coach at ${config.studioName} can answer that properly. Leave your name and a phone number or email and they'll get back to you shortly, and your first class is free.`,
    action: wantsPrice ? "HANDOFF" : "CAPTURE",
    sessionId: null,
    reason: wantsPrice
      ? "Visitor asked about price, which a coach owns."
      : "No model available, so the bot offered a coach.",
    generatedBy: "RULES",
    model: null,
  };
}

const NEGOTIATION =
  /\b(discount|cheaper|cheapest|too expensive|can'?t afford|budget|deal|special rate|price match|payment plan|scholarship|free month|waive)\b|\bcan you do \$/i;
const MONEY = /\$\s?\d/;
const KID_HINT =
  /\b(kid|kids|child|children|son|daughter|my boy|my girl|\d\s?(?:year|yr)s? old|toddler|teen)\b/i;
const ADULT_HINT = /\b(i want to|for myself|i'?m looking|adult|i train|get in shape|lose weight)\b/i;

/** Reads the age group from what the visitor says, since no form told us. */
export function inferAgeGroup(text: string, current: string): string {
  if (current !== "UNKNOWN") return current;
  if (KID_HINT.test(text)) return "KID";
  if (ADULT_HINT.test(text)) return "ADULT";
  return "UNKNOWN";
}

function transcript(messages: WebChatMessage[]): string {
  return messages
    .slice(-20)
    .map((message) => `${message.role === "VISITOR" ? "Visitor" : "Studio"}: ${message.body}`)
    .join("\n");
}

function buildPrompt(input: {
  chat: WebChat;
  config: BotSettings;
  facts: string;
  classes: { id: string; label: string }[];
  messages: WebChatMessage[];
}): string {
  const { chat, config, facts, classes, messages } = input;
  return [
    config.agentPersona,
    `You are answering the chat widget on the ${config.studioName} website — a martial arts studio in Medina, Minnesota teaching Brazilian Jiu-Jitsu, Muay Thai and Judo to kids and adults.`,
    "",
    "YOUR GOAL: answer what they asked, then get them either into a free trial class or in touch with a coach.",
    "",
    WEB_PLAYBOOK,
    "",
    WEB_RULES,
    "",
    "STUDIO FACTS (the only things you may state as fact):",
    facts || "none recorded — you may not state any specifics; hand off instead",
    "",
    classes.length > 0
      ? `UPCOMING CLASSES you may name:\n${classes.map((c) => `- [${c.id}] ${c.label}`).join("\n")}`
      : "UPCOMING CLASSES: none are loaded, so do not name a day or time; offer to have a coach confirm one.",
    "",
    "THE VISITOR:",
    [
      chat.visitorName ? `- Name: ${chat.visitorName}` : "- Name: unknown",
      `- Training for: ${chat.ageGroup === "KID" ? "a child" : chat.ageGroup === "ADULT" ? "themselves" : "unknown — find out"}`,
      chat.interest ? `- Interest: ${chat.interest}` : "",
      chat.leadId ? "- They have already given the studio their contact details." : "- We have no way to contact them yet.",
      chat.pageUrl ? `- Opened the chat on: ${chat.pageUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    "",
    `CONVERSATION SO FAR (most recent last):\n${transcript(messages) || "no messages yet"}`,
    "",
    "Reply with JSON only:",
    '{"message": string, "action": "ANSWER"|"CAPTURE"|"BOOK"|"HANDOFF", "sessionId": string|null, "reason": string}',
    "",
    "message is what the visitor reads. reason is one short line for staff explaining your read of them.",
    'Use "CAPTURE" when your message asks for their name and contact details, "BOOK" when you are naming a',
    'specific class for a visitor who has already given contact details, "HANDOFF" when a human must take over.',
    "sessionId is the bracketed id of the class you named, or null.",
  ].join("\n");
}

/** Visitor messages the studio has paid a model for today, used for the spend cap. */
export async function aiRepliesToday(now = new Date()): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  return prisma.webChatMessage.count({
    where: { role: "BOT", generatedBy: "AI", createdAt: { gte: startOfDay } },
  });
}

/**
 * Writes the bot's next message. Falls back to offering a coach whenever the model is unavailable,
 * over budget, or produces something it was not allowed to claim — the visitor always gets a way
 * forward rather than an error.
 */
export async function composeChatReply(chatId: string): Promise<ChatReply> {
  const chat = await prisma.webChat.findUniqueOrThrow({
    where: { id: chatId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  const config = await getBotConfig();
  const lastVisitor = [...chat.messages].reverse().find((m) => m.role === "VISITOR");
  const asked = lastVisitor?.body ?? "";

  // Price haggling is a coach's conversation on any channel.
  if (NEGOTIATION.test(asked)) {
    return {
      body: "That's a conversation for a coach rather than me — leave your name and a phone number or email and they'll get back to you shortly.",
      action: "HANDOFF",
      sessionId: null,
      reason: "Visitor is negotiating on price — a coach owns that conversation.",
      generatedBy: "RULES",
      model: null,
    };
  }

  if (!llmConfigured()) return fallbackReply(config, asked);
  if ((await aiRepliesToday()) >= config.webChatDailyCap) return cappedReply(config);

  const items: KnowledgeItem[] = await knowledgeForLead({ ageGroup: chat.ageGroup });
  const facts = renderKnowledge(items);
  const classes = await upcomingClasses(chat.interest, chat.ageGroup, config.timezone);

  const response = await callLlm({
    prompt: buildPrompt({ chat, config, facts, classes, messages: chat.messages }),
    json: true,
    temperature: 0.6,
    maxTokens: 500,
  });
  if (!response) return fallbackReply(config, asked);

  const parsed = parseJsonObject(response.text);
  const message = typeof parsed?.message === "string" ? parsed.message.trim() : "";
  if (!message) return fallbackReply(config, asked);

  const rawAction = String(parsed?.action ?? "ANSWER").toUpperCase();
  const action = (CHAT_ACTIONS as readonly string[]).includes(rawAction)
    ? (rawAction as ChatAction)
    : "ANSWER";

  if (chat.ageGroup === "KID" && MONEY.test(message)) {
    return {
      body: "Kids' rates depend on how many days a week they'd train, so I'd rather a coach gave you the right number. How many days a week were you thinking? Leave your name and a phone number or email and they'll price it for you.",
      action: "HANDOFF",
      sessionId: null,
      reason: "Draft quoted a children's rate, which depends on the family's schedule.",
      generatedBy: "AI",
      model: response.model,
    };
  }

  const allowed = [facts, classes.map((c) => c.label).join("\n")].join("\n");
  const verdict = verifyAgainstFacts(message, allowed);
  if (!verdict.ok) {
    return {
      ...fallbackReply(config, asked),
      action: "HANDOFF",
      reason: `Reply withheld: the bot ${verdict.violation}.`,
      generatedBy: "AI",
      model: response.model,
    };
  }

  const claimed = typeof parsed?.sessionId === "string" ? parsed.sessionId : "";
  return {
    body: message,
    action,
    sessionId: classes.some((c) => c.id === claimed) ? claimed : null,
    reason: typeof parsed?.reason === "string" ? parsed.reason : "",
    generatedBy: "AI",
    model: response.model,
  };
}
