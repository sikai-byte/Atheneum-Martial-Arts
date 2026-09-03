import { createHash } from "node:crypto";
import type { WebChat } from "@prisma/client";
import { prisma } from "../db";
import { getBotConfig } from "./config";
import { alertCoach, intakeLead, LeadInputError } from "./engine";
import { normalizePhone } from "./phone";
import {
  composeChatReply,
  inferAgeGroup,
  SMS_CONSENT_TEXT,
  type ChatReply,
} from "./webchat";

/**
 * The conversation half of the website bot: starting a chat, taking a visitor's message, and
 * turning the chat into a real `Lead` once they share contact details.
 */

export type ChatTurn = { chatId: string; reply: ChatReply; askForContact: boolean };

/** IPs are only ever stored hashed: we need them for rate limiting, not identification. */
export function hashIp(ip: string): string {
  const salt = process.env.SESSION_SECRET ?? "atheneum";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function startWebChat(input: {
  pageUrl?: string;
  referrer?: string;
  ip?: string;
}): Promise<{ chat: WebChat; greeting: string }> {
  const config = await getBotConfig();
  const chat = await prisma.webChat.create({
    data: {
      pageUrl: (input.pageUrl ?? "").slice(0, 500),
      referrer: (input.referrer ?? "").slice(0, 500),
      ipHash: input.ip ? hashIp(input.ip) : "",
    },
  });
  await prisma.webChatMessage.create({
    data: { chatId: chat.id, role: "BOT", body: config.webChatGreeting, action: "ANSWER" },
  });
  return { chat, greeting: config.webChatGreeting };
}

const INTEREST =
  /\b(bjj|jiu[- ]?jitsu|muay thai|kickbox\w*|judo|mma|sparring|wrestl\w*|self[- ]?defen[cs]e)\b/i;

/**
 * Records what the visitor said, answers it, and stores the answer. Returns `askForContact` so the
 * widget knows to show the contact form (with its consent checkbox) beneath the reply.
 */
export async function replyToVisitor(chatId: string, body: string): Promise<ChatTurn> {
  const text = body.trim().slice(0, 1000);
  if (!text) throw new LeadInputError("Say something first.");

  const chat = await prisma.webChat.findUniqueOrThrow({ where: { id: chatId } });
  if (chat.status === "CLOSED") throw new LeadInputError("This conversation has ended.");

  await prisma.webChatMessage.create({
    data: { chatId, role: "VISITOR", body: text },
  });
  await prisma.webChat.update({
    where: { id: chatId },
    data: {
      messageCount: { increment: 1 },
      ageGroup: inferAgeGroup(text, chat.ageGroup),
      ...(chat.interest ? {} : { interest: INTEREST.exec(text)?.[0] ?? "" }),
    },
  });

  const reply = await composeChatReply(chatId);

  await prisma.webChatMessage.create({
    data: {
      chatId,
      role: "BOT",
      body: reply.body,
      action: reply.action,
      generatedBy: reply.generatedBy,
      model: reply.model ?? "",
      reason: reply.reason,
    },
  });

  if (reply.action === "HANDOFF") {
    await prisma.webChat.update({
      where: { id: chatId },
      data: {
        status: chat.leadId ? "CAPTURED" : "HANDOFF",
        handoffAt: new Date(),
        handoffReason: reply.reason,
      },
    });
    // A coach can only be usefully alerted once there is someone to call back, so an anonymous
    // handoff waits in the queue until the visitor leaves details.
    if (chat.leadId) {
      const config = await getBotConfig();
      await prisma.lead.update({
        where: { id: chat.leadId },
        data: { handoffAt: new Date(), handoffReason: reply.reason },
      });
      await alertCoach(chat.leadId, `website chat — ${reply.reason}`, config);
    }
  }

  return {
    chatId,
    reply,
    askForContact: !chat.leadId && (reply.action === "CAPTURE" || reply.action === "HANDOFF"),
  };
}

export type CaptureInput = {
  chatId: string;
  name: string;
  phone?: string;
  email?: string;
  /** True only when the visitor actively ticked the consent checkbox. */
  smsConsent: boolean;
};

/**
 * Turns a chat into a lead. Consent decides what happens next and nothing else does: ticked means
 * the normal follow-up cadence picks them up within five minutes, unticked means the lead is
 * created but enrolled in nothing and a coach is asked to reach out by hand.
 */
export async function captureWebChatContact(input: CaptureInput) {
  const chat = await prisma.webChat.findUniqueOrThrow({ where: { id: input.chatId } });
  const name = input.name.trim();
  if (!name) throw new LeadInputError("We need a name to pass to a coach.");

  const phone = input.phone ? normalizePhone(input.phone) : null;
  const email = input.email?.trim() || null;
  if (!phone && !email) {
    throw new LeadInputError("Leave a phone number or an email so a coach can reach you.");
  }
  if (input.phone && !phone) {
    throw new LeadInputError(`"${input.phone}" isn't a phone number we can call.`);
  }
  // Consent to text is meaningless without a number to text.
  const consented = input.smsConsent && Boolean(phone);

  if (!phone) {
    // No number means no `Lead` (Lead.phone is required and unique), so the chat itself carries the
    // email until a coach picks it up. Better than inventing a placeholder number.
    return prisma.webChat.update({
      where: { id: chat.id },
      data: {
        visitorName: name,
        status: "HANDOFF",
        handoffAt: chat.handoffAt ?? new Date(),
        handoffReason: chat.handoffReason || `Website chat — email only: ${email}`,
      },
    });
  }

  const { lead } = await intakeLead({
    fullName: name,
    phone,
    email,
    source: "WEBSITE",
    formName: "Website chat",
    interest: chat.interest || null,
    ageGroup: chat.ageGroup,
    notes: `Captured by the website chat bot on ${chat.pageUrl || "the website"}.`,
    smsConsent: consented,
  });

  const updated = await prisma.webChat.update({
    where: { id: chat.id },
    data: {
      leadId: lead.id,
      visitorName: name,
      status: "CAPTURED",
      ...(consented ? { consentAt: new Date(), consentText: SMS_CONSENT_TEXT } : {}),
    },
  });

  await prisma.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "CREATED",
      summary: consented
        ? "Website chat bot captured this lead with SMS consent"
        : "Website chat bot captured this lead — no SMS consent, so nothing is queued",
      detail: consented ? SMS_CONSENT_TEXT : "Reach out by phone or email instead.",
    },
  });

  // An anonymous handoff had nobody to alert; now there is.
  if (chat.handoffAt) {
    const config = await getBotConfig();
    await prisma.lead.update({
      where: { id: lead.id },
      data: { handoffAt: chat.handoffAt, handoffReason: chat.handoffReason },
    });
    await alertCoach(lead.id, `website chat — ${chat.handoffReason}`, config);
  }

  return updated;
}

/** Transcript for the coach UI. */
export async function webChatWithMessages(chatId: string) {
  return prisma.webChat.findUnique({
    where: { id: chatId },
    include: { messages: { orderBy: { createdAt: "asc" } }, lead: true },
  });
}
