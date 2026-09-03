import type { LeadMessage } from "@prisma/client";
import { prisma } from "../db";
import { MAX_SEND_ATTEMPTS } from "./messageStatus";
import { sendSms } from "./sms";
import { truncateForSms } from "./templates";
import { validateOutbound, type OutboundActor } from "./validate";

/** How long a SENDING row can sit before we assume the process holding it died. */
const STALE_SENDING_MS = 5 * 60_000;

/** How long a PENDING row waits before a tick picks it up rather than its original caller. */
const STALE_PENDING_MS = 60_000;

export type QueueOutboundInput = {
  leadId: string;
  body: string;
  actor: OutboundActor;
  automated?: boolean;
  /** True for anything the model wrote, including a draft a coach edited before approving. */
  agentAuthored?: boolean;
  agentAction?: string | null;
  proposedSessionId?: string | null;
  stepOrder?: number | null;
  sentBy?: string | null;
  staffEdited?: boolean;
};

export type DeliveryOutcome =
  | { status: "SENT"; message: LeadMessage }
  | { status: "FAILED"; message: LeadMessage; error: string; retryable: boolean }
  | { status: "BLOCKED"; message: LeadMessage; reason: string }
  /** Queued but not sendable yet (quiet hours); a later tick delivers it. */
  | { status: "DEFERRED"; message: LeadMessage; reason: string }
  | { status: "CLAIMED_ELSEWHERE"; message: LeadMessage };

async function logEvent(leadId: string, type: string, summary: string, detail = "") {
  await prisma.leadEvent.create({ data: { leadId, type, summary, detail } });
}

/**
 * Records the intent to send before anything can go wrong. Nothing in the app may call the SMS
 * provider without a row here first: a message that exists only as a local variable is a message
 * that disappears when the provider errors, which is exactly what used to happen when a coach
 * approved a draft and Twilio rejected it.
 */
export async function queueOutbound(input: QueueOutboundInput): Promise<LeadMessage> {
  return prisma.leadMessage.create({
    data: {
      leadId: input.leadId,
      direction: "OUTBOUND",
      body: truncateForSms(input.body.trim()),
      status: "PENDING",
      actor: input.actor,
      automated: input.automated ?? input.actor === "AUTOMATION",
      agentAuthored: input.agentAuthored ?? false,
      agentAction: input.agentAction ?? null,
      proposedSessionId: input.proposedSessionId ?? null,
      stepOrder: input.stepOrder ?? null,
      sentBy: input.sentBy ?? null,
      staffEdited: input.staffEdited ?? false,
    },
  });
}

/**
 * Validates and delivers one queued message, then leaves the row in a state that says what
 * happened. Idempotent: the claim is a conditional update, so two concurrent ticks (or a
 * double-clicked retry) can't both reach the provider with the same row.
 */
export async function deliverOutbound(messageId: string, now = new Date()): Promise<DeliveryOutcome> {
  const claimed = await prisma.leadMessage.updateMany({
    where: {
      id: messageId,
      OR: [
        { status: "PENDING" },
        // A crash mid-attempt would otherwise strand the row in SENDING forever.
        { status: "SENDING", lastAttemptAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
      ],
    },
    data: { status: "SENDING", attempts: { increment: 1 }, lastAttemptAt: now, errorText: null },
  });

  const message = await prisma.leadMessage.findUniqueOrThrow({ where: { id: messageId } });
  if (claimed.count === 0) return { status: "CLAIMED_ELSEWHERE", message };

  const verdict = await validateOutbound({
    leadId: message.leadId,
    body: message.body,
    actor: message.actor === "STAFF" ? "STAFF" : "AUTOMATION",
    agentAuthored: message.agentAuthored,
    proposedSessionId: message.proposedSessionId,
    excludeMessageId: message.id,
    now,
  });
  if (!verdict.ok && verdict.defer) {
    // Back to PENDING rather than BLOCKED: the attempt is undone so the next tick delivers it once
    // quiet hours lift, and a night of follow-ups doesn't land in the staff's retry queue.
    const deferred = await prisma.leadMessage.update({
      where: { id: message.id },
      data: { status: "PENDING", attempts: { decrement: 1 }, errorText: verdict.reason },
    });
    return { status: "DEFERRED", message: deferred, reason: verdict.reason };
  }
  if (!verdict.ok) {
    const blocked = await prisma.leadMessage.update({
      where: { id: message.id },
      data: { status: "BLOCKED", errorText: verdict.reason },
    });
    await logEvent(message.leadId, "SEND_BLOCKED", "A text was held before sending", verdict.reason);
    return { status: "BLOCKED", message: blocked, reason: verdict.reason };
  }

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: message.leadId } });
  const result = await sendSms(lead.phone, message.body, {
    name: lead.fullName,
    email: lead.email,
  });

  if (!result.ok) {
    const retryable = message.attempts < MAX_SEND_ATTEMPTS;
    const failed = await prisma.leadMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", provider: result.provider, errorText: result.error },
    });
    await logEvent(
      message.leadId,
      "SEND_FAILED",
      `${result.provider} rejected a text (attempt ${message.attempts})`,
      result.error,
    );
    return { status: "FAILED", message: failed, error: result.error, retryable };
  }

  const sent = await prisma.leadMessage.update({
    where: { id: message.id },
    data: {
      status: "SENT",
      provider: result.provider,
      providerId: result.providerId,
      errorText: null,
      sentAt: now,
    },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      lastOutboundAt: now,
      firstContactedAt: lead.firstContactedAt ?? now,
      status: lead.status === "NEW" ? "CONTACTED" : lead.status,
    },
  });
  return { status: "SENT", message: sent };
}

/** Queue and immediately attempt one message — the shape almost every caller wants. */
export async function sendOutbound(
  input: QueueOutboundInput,
  now = new Date(),
): Promise<DeliveryOutcome> {
  const queued = await queueOutbound(input);
  return deliverOutbound(queued.id, now);
}

/**
 * Staff-driven retry of a failed or blocked message. Blocked messages are re-validated rather than
 * forced through: if the lead opted out, no amount of clicking retry may text them.
 */
export async function retryOutbound(
  messageId: string,
  staffName: string,
  now = new Date(),
): Promise<DeliveryOutcome> {
  const message = await prisma.leadMessage.findUniqueOrThrow({ where: { id: messageId } });
  if (message.status !== "FAILED" && message.status !== "BLOCKED") {
    return { status: "CLAIMED_ELSEWHERE", message };
  }
  await prisma.leadMessage.update({
    where: { id: messageId },
    // A hand-driven retry restarts the attempt budget: a human decided this is worth another go.
    data: { status: "PENDING", attempts: 0, sentBy: message.sentBy ?? staffName },
  });
  await logEvent(message.leadId, "SEND_RETRIED", `${staffName} retried a failed text`, message.body);
  return deliverOutbound(messageId, now);
}

/**
 * Re-attempts messages the last tick left failed, deferred or mid-flight, oldest first. Bounded by
 * attempts so a permanently rejecting provider (an unregistered 10DLC number, say) parks the
 * message for staff instead of retrying forever.
 */
export async function retryStuckOutbound(now = new Date(), take = 50) {
  const stuck = await prisma.leadMessage.findMany({
    where: {
      direction: "OUTBOUND",
      attempts: { lt: MAX_SEND_ATTEMPTS },
      OR: [
        { status: "FAILED" },
        // Queued by an earlier tick and never delivered — quiet hours, or a crash between the
        // insert and the attempt.
        { status: "PENDING", createdAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) } },
        { status: "SENDING", lastAttemptAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take,
  });

  const summary = { considered: stuck.length, sent: 0, failed: 0, blocked: 0, deferred: 0 };
  for (const message of stuck) {
    if (message.status !== "PENDING") {
      await prisma.leadMessage.update({ where: { id: message.id }, data: { status: "PENDING" } });
    }
    const outcome = await deliverOutbound(message.id, now);
    if (outcome.status === "SENT") summary.sent += 1;
    else if (outcome.status === "BLOCKED") summary.blocked += 1;
    else if (outcome.status === "FAILED") summary.failed += 1;
    else if (outcome.status === "DEFERRED") summary.deferred += 1;
  }
  return summary;
}
