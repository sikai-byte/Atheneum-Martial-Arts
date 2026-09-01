import type { Lead } from "@prisma/client";
import { prisma } from "../db";
import { getBotConfig, isQuietHour, nextSendableTime } from "./config";
import { investigateAndSave } from "./investigate";
import { firstName, normalizePhone } from "./phone";
import { sendSms, type SmsProvider } from "./sms";
import { renderTemplate, truncateForSms } from "./templates";

export const NEW_LEAD_SEQUENCE = "NEW_LEAD";
export const REACTIVATION_SEQUENCE = "REACTIVATION";

const OPT_OUT_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "remove me"];
const HOT_REPLY_WORDS = [
  "yes",
  "yeah",
  "yep",
  "sure",
  "sounds good",
  "interested",
  "sign up",
  "book",
  "trial",
  "when",
  "what time",
  "how much",
  "price",
];

/** Statuses where automated follow-up should stop on its own. */
const TERMINAL_STATUSES = ["WON", "LOST", "UNSUBSCRIBED"];

export type CreateLeadInput = {
  fullName: string;
  phone: string;
  email?: string | null;
  source?: string;
  sourceRef?: string | null;
  campaign?: string | null;
  formName?: string | null;
  interest?: string | null;
  ageGroup?: string;
  childName?: string | null;
  answers?: Record<string, string>;
  notes?: string;
  submittedAt?: Date;
  sequenceKey?: string;
};

export class LeadInputError extends Error {}

async function logEvent(leadId: string, type: string, summary: string, detail = "") {
  await prisma.leadEvent.create({ data: { leadId, type, summary, detail } });
}

/**
 * Creates (or refreshes) a lead, investigates it, and starts its follow-up sequence. The first
 * text is attempted inline so a Facebook lead hears back in seconds; the cron dispatcher is only
 * the backstop that guarantees the 5-minute SLA if this request path fails.
 */
export async function intakeLead(input: CreateLeadInput) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new LeadInputError(`"${input.phone}" isn't a phone number we can text.`);
  const fullName = input.fullName.trim();
  if (!fullName) throw new LeadInputError("A lead needs a name.");

  const existing = await prisma.lead.findUnique({ where: { phone } });
  const data = {
    fullName,
    phone,
    email: input.email?.trim() || null,
    source: input.source ?? "MANUAL",
    sourceRef: input.sourceRef ?? null,
    campaign: input.campaign ?? null,
    formName: input.formName ?? null,
    interest: input.interest?.trim() || null,
    ageGroup: input.ageGroup ?? "UNKNOWN",
    childName: input.childName?.trim() || null,
    answers: JSON.stringify(input.answers ?? {}),
    notes: input.notes ?? "",
    submittedAt: input.submittedAt ?? new Date(),
  };

  const lead = existing
    ? await prisma.lead.update({
        where: { id: existing.id },
        data: { ...data, notes: input.notes ? input.notes : existing.notes },
      })
    : await prisma.lead.create({ data });

  await logEvent(
    lead.id,
    "CREATED",
    existing ? `Lead resubmitted via ${lead.source}` : `Lead captured from ${lead.source}`,
    [lead.campaign, lead.formName, lead.interest].filter(Boolean).join(" · "),
  );

  await investigateAndSave(lead.id);

  if (lead.optedOutAt) {
    await logEvent(lead.id, "PAUSED", "Follow-up not started: this number opted out of texts");
    return { lead, enrolled: false };
  }

  const sequenceKey =
    input.sequenceKey ??
    (Date.now() - data.submittedAt.getTime() > 14 * 86_400_000
      ? REACTIVATION_SEQUENCE
      : NEW_LEAD_SEQUENCE);

  await enrollLead(lead.id, sequenceKey);
  await dispatchDueFollowUps({ leadId: lead.id });

  return { lead: await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }), enrolled: true };
}

/** Puts a lead at the top of a sequence, replacing anything previously queued. */
export async function enrollLead(leadId: string, sequenceKey: string) {
  const sequence = await prisma.sequence.findUnique({
    where: { key: sequenceKey },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!sequence) throw new LeadInputError(`No follow-up sequence named ${sequenceKey}.`);
  const first = sequence.steps[0];
  if (!first) throw new LeadInputError(`Sequence ${sequenceKey} has no steps.`);

  await prisma.followUpTask.updateMany({
    where: { leadId, status: "PENDING" },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  await prisma.lead.update({
    where: { id: leadId },
    data: { sequenceKey, sequenceStep: 0, pausedAt: null },
  });
  await prisma.followUpTask.create({
    data: {
      leadId,
      sequenceKey,
      stepOrder: first.order,
      dueAt: new Date(Date.now() + first.delayMinutes * 60_000),
    },
  });
  await logEvent(leadId, "RESUMED", `Enrolled in the ${sequence.name} sequence`, sequence.purpose);
}

async function scheduleNextStep(lead: Lead, justSentOrder: number) {
  if (!lead.sequenceKey) return;
  const next = await prisma.sequenceStep.findFirst({
    where: { sequence: { key: lead.sequenceKey }, order: { gt: justSentOrder } },
    orderBy: { order: "asc" },
  });
  if (!next) return;
  await prisma.followUpTask.create({
    data: {
      leadId: lead.id,
      sequenceKey: lead.sequenceKey,
      stepOrder: next.order,
      dueAt: new Date(Date.now() + next.delayMinutes * 60_000),
    },
  });
}

export type DispatchSummary = {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  rescheduled: number;
};

/**
 * Sends every follow-up that is due. Safe to call on every cron tick and inline after intake.
 */
export async function dispatchDueFollowUps(options: { leadId?: string; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const config = await getBotConfig();
  const summary: DispatchSummary = { considered: 0, sent: 0, skipped: 0, failed: 0, rescheduled: 0 };

  const tasks = await prisma.followUpTask.findMany({
    where: {
      status: "PENDING",
      dueAt: { lte: now },
      ...(options.leadId ? { leadId: options.leadId } : {}),
    },
    include: { lead: { include: { insight: true } } },
    orderBy: { dueAt: "asc" },
    take: 100,
  });

  for (const task of tasks) {
    summary.considered += 1;
    const { lead } = task;

    if (lead.optedOutAt || TERMINAL_STATUSES.includes(lead.status)) {
      await prisma.followUpTask.update({
        where: { id: task.id },
        data: { status: "SKIPPED", completedAt: now, lastError: `Lead is ${lead.status}` },
      });
      summary.skipped += 1;
      continue;
    }
    if (lead.pausedAt || !config.autopilot) {
      summary.skipped += 1;
      continue; // stays pending; resuming the lead (or autopilot) picks it back up
    }
    if (isQuietHour(now, config)) {
      const dueAt = nextSendableTime(now, config);
      await prisma.followUpTask.update({ where: { id: task.id }, data: { dueAt } });
      summary.rescheduled += 1;
      continue;
    }

    const step = await prisma.sequenceStep.findFirst({
      where: { sequence: { key: task.sequenceKey }, order: task.stepOrder },
    });
    if (!step) {
      await prisma.followUpTask.update({
        where: { id: task.id },
        data: { status: "SKIPPED", completedAt: now, lastError: "Sequence step no longer exists" },
      });
      summary.skipped += 1;
      continue;
    }

    const isFirstTouch = !lead.firstContactedAt;
    const body = truncateForSms(
      isFirstTouch && lead.insight?.suggestedFirstText
        ? lead.insight.suggestedFirstText
        : renderTemplate(step.template, {
            lead,
            insight: lead.insight,
            studioName: config.studioName,
            signature: config.signature,
            bookingLink: config.bookingLink,
          }),
    );

    const result = await sendSms(lead.phone, body, {
      name: lead.fullName,
      email: lead.email,
    });
    if (!result.ok) {
      await prisma.followUpTask.update({
        where: { id: task.id },
        data: {
          status: task.attempts >= 2 ? "FAILED" : "PENDING",
          attempts: { increment: 1 },
          lastError: result.error,
          dueAt: new Date(now.getTime() + 10 * 60_000),
          completedAt: task.attempts >= 2 ? now : null,
        },
      });
      await prisma.leadMessage.create({
        data: {
          leadId: lead.id,
          direction: "OUTBOUND",
          body,
          status: "FAILED",
          provider: result.provider,
          errorText: result.error,
          automated: true,
          stepOrder: step.order,
        },
      });
      await logEvent(lead.id, "SEND_FAILED", `Step ${step.order} text failed`, result.error);
      summary.failed += 1;
      continue;
    }

    await prisma.leadMessage.create({
      data: {
        leadId: lead.id,
        direction: "OUTBOUND",
        body,
        status: "SENT",
        provider: result.provider,
        providerId: result.providerId,
        automated: true,
        stepOrder: step.order,
      },
    });
    await prisma.followUpTask.update({
      where: { id: task.id },
      data: { status: "SENT", completedAt: now, attempts: { increment: 1 } },
    });
    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        sequenceStep: step.order,
        lastOutboundAt: now,
        firstContactedAt: lead.firstContactedAt ?? now,
        status: lead.status === "NEW" ? "CONTACTED" : lead.status,
      },
    });
    const minutesToFirstTouch = isFirstTouch
      ? Math.round((now.getTime() - lead.submittedAt.getTime()) / 60_000)
      : null;
    await logEvent(
      lead.id,
      "SMS_SENT",
      isFirstTouch
        ? `First follow-up text sent ${minutesToFirstTouch} min after the lead came in`
        : `Follow-up step ${step.order} text sent`,
      body,
    );
    await scheduleNextStep(updatedLead, step.order);
    summary.sent += 1;
  }

  return summary;
}

export async function sendManualSms(leadId: string, rawBody: string, staffName: string) {
  const body = truncateForSms(rawBody.trim());
  if (!body) throw new LeadInputError("Write a message first.");
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.optedOutAt) throw new LeadInputError("This lead opted out of texts.");

  const result = await sendSms(lead.phone, body, { name: lead.fullName, email: lead.email });
  await prisma.leadMessage.create({
    data: {
      leadId,
      direction: "OUTBOUND",
      body,
      status: result.ok ? "SENT" : "FAILED",
      provider: result.provider,
      providerId: result.ok ? result.providerId : null,
      errorText: result.ok ? null : result.error,
      sentBy: staffName,
    },
  });
  if (!result.ok) {
    await logEvent(leadId, "SEND_FAILED", `${staffName} tried to text the lead`, result.error);
    throw new LeadInputError(`${result.provider} rejected the message: ${result.error}`);
  }
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      lastOutboundAt: new Date(),
      firstContactedAt: lead.firstContactedAt ?? new Date(),
      status: lead.status === "NEW" ? "CONTACTED" : lead.status,
    },
  });
  await logEvent(leadId, "SMS_SENT", `${staffName} texted the lead`, body);
}

export async function pauseSequence(leadId: string, reason: string) {
  await prisma.lead.update({ where: { id: leadId }, data: { pausedAt: new Date() } });
  await logEvent(leadId, "PAUSED", "Automated follow-up paused", reason);
}

export async function resumeSequence(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { tasks: { where: { status: "PENDING" } } },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { pausedAt: null } });
  if (lead.tasks.length === 0 && lead.sequenceKey) {
    await scheduleNextStep(lead, lead.sequenceStep);
  }
  await logEvent(leadId, "RESUMED", "Automated follow-up resumed");
}

export async function optOutLead(leadId: string, reason: string) {
  await prisma.followUpTask.updateMany({
    where: { leadId, status: "PENDING" },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  await prisma.lead.update({
    where: { id: leadId },
    data: { optedOutAt: new Date(), status: "UNSUBSCRIBED" },
  });
  await logEvent(leadId, "OPTED_OUT", "Lead opted out of texts", reason);
}

export async function setLeadStatus(leadId: string, status: string) {
  const allowed = ["NEW", "CONTACTED", "ENGAGED", "BOOKED", "WON", "LOST", "UNSUBSCRIBED"];
  if (!allowed.includes(status)) throw new LeadInputError("Unknown lead status.");
  await prisma.lead.update({ where: { id: leadId }, data: { status } });
  if (TERMINAL_STATUSES.includes(status) || status === "BOOKED") {
    await prisma.followUpTask.updateMany({
      where: { leadId, status: "PENDING" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
  }
  await logEvent(leadId, "STATUS_CHANGED", `Status set to ${status}`);
}

function looksLikeOptOut(body: string) {
  const normalized = body.trim().toLowerCase().replace(/[^a-z ]/g, "");
  return OPT_OUT_WORDS.includes(normalized) || OPT_OUT_WORDS.some((w) => normalized === `${w} please`);
}

/**
 * Records an inbound text, stops the robot from talking over a live conversation, and (optionally)
 * acknowledges instantly so the lead isn't left waiting for a human.
 */
export async function handleInboundSms(
  fromPhone: string,
  rawBody: string,
  provider: SmsProvider = "TWILIO",
) {
  const phone = normalizePhone(fromPhone);
  if (!phone) return { matched: false as const };
  const lead = await prisma.lead.findUnique({ where: { phone } });
  if (!lead) return { matched: false as const };

  const body = rawBody.trim();
  const now = new Date();
  await prisma.leadMessage.create({
    data: { leadId: lead.id, direction: "INBOUND", body, status: "RECEIVED", provider },
  });
  await logEvent(lead.id, "SMS_RECEIVED", "Lead replied by text", body);

  if (looksLikeOptOut(body)) {
    await optOutLead(lead.id, `Lead texted "${body}"`);
    return { matched: true as const, optedOut: true, autoReplied: false };
  }

  // A human is now in the conversation: cancel the queued drip so the bot can't talk over them.
  await prisma.followUpTask.updateMany({
    where: { leadId: lead.id, status: "PENDING" },
    data: { status: "CANCELLED", completedAt: now },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      lastInboundAt: now,
      status: ["BOOKED", "WON", "LOST"].includes(lead.status) ? lead.status : "ENGAGED",
      pausedAt: now,
    },
  });
  await logEvent(lead.id, "PAUSED", "Automated follow-up paused because the lead replied");
  await investigateAndSave(lead.id);

  const config = await getBotConfig();
  let autoReplied = false;
  if (config.autoReplyEnabled && !isQuietHour(now, config)) {
    const interested = HOT_REPLY_WORDS.some((w) => body.toLowerCase().includes(w));
    const reply = truncateForSms(
      interested
        ? `Awesome, ${firstName(lead.fullName)}! A coach will text you in a few minutes to lock in a class time. If it's easier, you can grab a spot here: ${config.bookingLink}`
        : `Thanks ${firstName(lead.fullName)} — got it. A coach at ${config.studioName} will follow up shortly.`,
    );
    const result = await sendSms(lead.phone, reply, { name: lead.fullName, email: lead.email });
    await prisma.leadMessage.create({
      data: {
        leadId: lead.id,
        direction: "OUTBOUND",
        body: reply,
        status: result.ok ? "SENT" : "FAILED",
        provider: result.provider,
        providerId: result.ok ? result.providerId : null,
        errorText: result.ok ? null : result.error,
        automated: true,
      },
    });
    if (result.ok) {
      await prisma.lead.update({ where: { id: lead.id }, data: { lastOutboundAt: new Date() } });
      await logEvent(lead.id, "SMS_SENT", "Auto-acknowledged the reply", reply);
      autoReplied = true;
    }
  }

  return { matched: true as const, optedOut: false, autoReplied };
}
