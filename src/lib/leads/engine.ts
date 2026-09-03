import type { Lead } from "@prisma/client";
import { prisma } from "../db";
import { composeAgentReply, type AgentReply } from "./agent";
import { getBotConfig, isQuietHour, nextSendableTime, type BotSettings } from "./config";
import { investigateAndSave } from "./investigate";
import { llmConfigured } from "./llm";
import { deliverOutbound, sendOutbound } from "./outbox";
import { firstName, normalizePhone } from "./phone";
import { sendSms, type SmsProvider } from "./sms";
import { renderTemplate, truncateForSms } from "./templates";

export const NEW_LEAD_SEQUENCE = "NEW_LEAD";
export const REACTIVATION_SEQUENCE = "REACTIVATION";
export const MEMBER_NURTURE_SEQUENCE = "MEMBER_NURTURE";

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

/**
 * Won leads are members now, and the nurture cadence is the only automation allowed to keep
 * texting them — a sales drip must never keep running against someone who already bought.
 */
function sequenceAllowedForStatus(sequenceKey: string, status: string): boolean {
  if (sequenceKey === MEMBER_NURTURE_SEQUENCE) return status === "WON";
  return !TERMINAL_STATUSES.includes(status);
}

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

    if (lead.optedOutAt || !sequenceAllowedForStatus(task.sequenceKey, lead.status)) {
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

    const outcome = await sendOutbound(
      {
        leadId: lead.id,
        body,
        actor: "AUTOMATION",
        agentAuthored: isFirstTouch && Boolean(lead.insight?.suggestedFirstText),
        stepOrder: step.order,
      },
      now,
    );

    if (outcome.status === "BLOCKED") {
      // The gate refused it (opt-out landing mid-tick, an unverifiable claim). Retrying on a timer
      // would just be refused again, so the task stops and the blocked text stays on the thread.
      await prisma.followUpTask.update({
        where: { id: task.id },
        data: {
          status: "SKIPPED",
          completedAt: now,
          attempts: { increment: 1 },
          lastError: outcome.reason,
        },
      });
      summary.skipped += 1;
      continue;
    }

    if (outcome.status === "DEFERRED") {
      // Only reachable if quiet hours began inside this tick; the queued text is durable and the
      // outbox delivers it, so the task just waits rather than writing a second copy.
      await prisma.followUpTask.update({
        where: { id: task.id },
        data: { dueAt: nextSendableTime(now, config), lastError: outcome.reason },
      });
      summary.rescheduled += 1;
      continue;
    }

    if (outcome.status !== "SENT") {
      const error = outcome.status === "FAILED" ? outcome.error : "Another tick is sending this";
      const exhausted = outcome.status === "FAILED" && !outcome.retryable;
      await prisma.followUpTask.update({
        where: { id: task.id },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          attempts: { increment: 1 },
          lastError: error,
          dueAt: new Date(now.getTime() + 10 * 60_000),
          completedAt: exhausted ? now : null,
        },
      });
      summary.failed += 1;
      continue;
    }

    await prisma.followUpTask.update({
      where: { id: task.id },
      data: { status: "SENT", completedAt: now, attempts: { increment: 1 } },
    });
    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: { sequenceStep: step.order },
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

  const outcome = await sendOutbound({
    leadId,
    body,
    actor: "STAFF",
    automated: false,
    sentBy: staffName,
  });

  if (outcome.status === "BLOCKED" || outcome.status === "DEFERRED") {
    throw new LeadInputError(outcome.reason);
  }
  if (outcome.status !== "SENT") {
    const error = outcome.status === "FAILED" ? outcome.error : "That message is already sending.";
    // The text is still on the thread as a failed message, so it can be retried rather than retyped.
    throw new LeadInputError(`${outcome.message.provider} rejected the message: ${error}`);
  }
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

/**
 * Puts the lead in a real class. Nothing else in the agent is allowed to claim someone is booked
 * without this row existing, so "you're in for Wednesday 5:15" is always true.
 */
export async function bookTrial(leadId: string, sessionId: string, bookedBy: string) {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { template: true },
  });
  if (!session || session.status !== "SCHEDULED") {
    throw new LeadInputError("That class is no longer on the schedule.");
  }
  if (session.startsAt < new Date()) throw new LeadInputError("That class has already run.");

  const booking = await prisma.trialBooking.upsert({
    where: { leadId_sessionId: { leadId, sessionId } },
    update: { status: "BOOKED", bookedBy },
    create: { leadId, sessionId, bookedBy },
  });

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (!TERMINAL_STATUSES.includes(lead.status) && lead.status !== "WON") {
    await setLeadStatus(leadId, "BOOKED");
  }
  await logEvent(
    leadId,
    "TRIAL_BOOKED",
    `Trial booked by ${bookedBy}`,
    `${session.template.name} on ${session.startsAt.toISOString()}`,
  );
  return booking;
}

export async function cancelTrial(bookingId: string, staffName: string) {
  const booking = await prisma.trialBooking.update({
    where: { id: bookingId },
    data: { status: "CANCELLED" },
    include: { session: { include: { template: true } } },
  });
  await logEvent(
    booking.leadId,
    "TRIAL_CANCELLED",
    `${staffName} cancelled the trial booking`,
    booking.session.template.name,
  );
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
  let drafted = false;
  if (config.autoReplyEnabled && !isQuietHour(now, config)) {
    const outcome = await respondToLead(lead.id);
    autoReplied = outcome.sent;
    drafted = outcome.drafted;
  }

  return { matched: true as const, optedOut: false, autoReplied, drafted };
}

/** A quick acknowledgement for when the sales agent is switched off entirely. */
function keywordAcknowledgement(
  lead: Pick<Lead, "fullName">,
  lastInbound: string,
  config: { studioName: string; bookingLink: string },
): AgentReply {
  const interested = HOT_REPLY_WORDS.some((w) => lastInbound.toLowerCase().includes(w));
  return {
    sessionId: null,
    body: truncateForSms(
      interested
        ? `Awesome, ${firstName(lead.fullName)}! A coach will text you in a few minutes to lock in a class time. If it's easier, you can grab a spot here: ${config.bookingLink}`
        : `Thanks ${firstName(lead.fullName)} — got it. A coach at ${config.studioName} will follow up shortly.`,
    ),
    action: "HANDOFF",
    reason: "Sales agent is switched off; acknowledged and handed off.",
    generatedBy: "RULES",
    model: null,
  };
}

/**
 * Texts the coach when the agent hands a lead over — pricing questions, haggling, anything it may
 * not answer — so a live conversation is not left waiting on someone checking the inbox. Quiet
 * hours do not apply: this goes to staff, not to a lead.
 */
async function alertCoach(leadId: string, reason: string, config: BotSettings): Promise<boolean> {
  const to = normalizePhone(config.coachAlertPhone);
  if (!to) return false;

  const since = new Date(Date.now() - config.coachAlertHours * 60 * 60 * 1000);
  const recent = await prisma.leadEvent.findFirst({
    where: { leadId, type: "COACH_ALERTED", createdAt: { gte: since } },
  });
  if (recent) return false;

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { messages: { where: { direction: "INBOUND" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const body = truncateForSms(
    [
      `${lead.fullName} (${lead.phone}) needs you: ${reason}`,
      lead.messages[0] ? `They said: "${lead.messages[0].body}"` : "",
      base ? `${base}/coach/leads/${lead.id}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const result = await sendSms(to, body);
  await logEvent(
    leadId,
    "COACH_ALERTED",
    result.ok ? "Texted the coach about this handoff" : "Could not text the coach about this handoff",
    result.ok ? body : result.error,
  );
  return result.ok;
}

/**
 * Runs the sales agent over a conversation and either sends its reply or leaves it as a draft for
 * staff, depending on `agentMode`. Drafts are stored as `DRAFT` messages on the thread so the
 * coach sees the proposed text in context rather than in a separate queue.
 */
export async function respondToLead(
  leadId: string,
  options: { goal?: string } = {},
): Promise<{ sent: boolean; drafted: boolean; reply: AgentReply }> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1, where: { direction: "INBOUND" } } },
  });
  const config = await getBotConfig();

  const reply =
    config.agentEnabled && llmConfigured()
      ? await composeAgentReply(leadId, { goal: options.goal })
      : keywordAcknowledgement(lead, lead.messages[0]?.body ?? "", config);

  if (reply.action === "HANDOFF") {
    await prisma.lead.update({
      where: { id: leadId },
      data: { handoffAt: new Date(), handoffReason: reply.reason },
    });
    await logEvent(leadId, "HANDOFF", "Sales agent asked for a human", reply.reason);
    await alertCoach(leadId, reply.reason, config);
  }

  // A draft is the safe default: nothing reaches the lead until a coach approves it.
  const autopilot = config.agentMode === "AUTOPILOT" && reply.action !== "HANDOFF";
  if (!autopilot) {
    await prisma.leadMessage.create({
      data: {
        leadId,
        direction: "OUTBOUND",
        body: reply.body,
        status: "DRAFT",
        provider: "MOCK",
        actor: "AUTOMATION",
        automated: true,
        agentAuthored: true,
        agentAction: reply.action,
        proposedSessionId: reply.sessionId,
        errorText: reply.reason || null,
      },
    });
    await logEvent(leadId, "AGENT_DRAFTED", "Sales agent drafted a reply for review", reply.body);
    return { sent: false, drafted: true, reply };
  }

  const sent = await deliverAgentMessage(leadId, reply);
  return { sent, drafted: false, reply };
}

async function deliverAgentMessage(leadId: string, reply: AgentReply): Promise<boolean> {
  const outcome = await sendOutbound({
    leadId,
    body: reply.body,
    actor: "AUTOMATION",
    agentAuthored: true,
    agentAction: reply.action,
    proposedSessionId: reply.sessionId,
  });
  if (outcome.status !== "SENT") return false;

  if (reply.sessionId) await bookTrial(leadId, reply.sessionId, "agent");
  await logEvent(
    leadId,
    "SMS_SENT",
    `Sales agent replied (${reply.action.toLowerCase()})`,
    `${reply.body}${reply.reason ? `\n\nRead: ${reply.reason}` : ""}`,
  );
  return true;
}

/** Staff clicked "draft a reply" on a thread. */
export async function draftAgentReply(leadId: string) {
  const reply = await composeAgentReply(leadId);
  await prisma.leadMessage.create({
    data: {
      leadId,
      direction: "OUTBOUND",
      body: reply.body,
      status: "DRAFT",
      provider: "MOCK",
      actor: "AUTOMATION",
      automated: true,
      agentAuthored: true,
      agentAction: reply.action,
      proposedSessionId: reply.sessionId,
      errorText: reply.reason || null,
    },
  });
  await logEvent(leadId, "AGENT_DRAFTED", "Sales agent drafted a reply for review", reply.body);
  return reply;
}

/**
 * Sends a draft a coach approved, editing it first if they changed the wording. The draft row is
 * promoted in place rather than deleted and recreated: a provider error leaves the coach's exact
 * words on the thread as a failed message they can retry, instead of losing them.
 */
export async function approveAgentDraft(messageId: string, staffName: string, editedBody?: string) {
  const draft = await prisma.leadMessage.findUniqueOrThrow({ where: { id: messageId } });
  if (draft.status !== "DRAFT") throw new LeadInputError("That message was already handled.");
  const body = truncateForSms((editedBody ?? draft.body).trim());
  if (!body) throw new LeadInputError("Write a message first.");
  const edited = body !== draft.body.trim();

  await prisma.leadMessage.update({
    where: { id: messageId },
    data: {
      body,
      status: "PENDING",
      // The coach is accountable for the send, but the agent wrote the words, so the edited text
      // still has to clear the same fact checks the model's original did.
      actor: "STAFF",
      staffEdited: edited,
      sentBy: staffName,
      errorText: null,
    },
  });

  const outcome = await deliverOutbound(messageId);
  if (outcome.status === "BLOCKED" || outcome.status === "DEFERRED") {
    throw new LeadInputError(outcome.reason);
  }
  if (outcome.status !== "SENT") {
    const error = outcome.status === "FAILED" ? outcome.error : "That draft is already sending.";
    throw new LeadInputError(`${outcome.message.provider} rejected the message: ${error}`);
  }

  await prisma.lead.update({
    where: { id: draft.leadId },
    data: { handoffAt: null, handoffReason: "" },
  });
  if (draft.proposedSessionId) await bookTrial(draft.leadId, draft.proposedSessionId, staffName);
  await logEvent(
    draft.leadId,
    "SMS_SENT",
    edited
      ? `${staffName} edited and sent the agent's draft`
      : `${staffName} approved the agent's draft`,
    body,
  );
}

/**
 * Whether a booked trial actually turned up. Nothing infers this — an unmarked trial stays
 * unknown rather than counting as a no-show, so the show rate is only ever built on real answers.
 */
export async function markTrialAttendance(bookingId: string, attended: boolean, staffName: string) {
  const booking = await prisma.trialBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status === "CANCELLED") throw new LeadInputError("That trial was cancelled.");
  const updated = await prisma.trialBooking.update({
    where: { id: bookingId },
    data: {
      status: attended ? "ATTENDED" : "NO_SHOW",
      attendanceAt: new Date(),
      attendanceBy: staffName,
    },
  });
  await logEvent(
    booking.leadId,
    "TRIAL_ATTENDANCE",
    attended ? `${staffName} marked the trial attended` : `${staffName} marked the trial a no-show`,
  );
  return updated;
}

/** Records measured staff attention on a lead. See `src/lib/analytics/funnel.ts`. */
export async function recordStaffTouch(
  leadId: string,
  staffName: string,
  seconds: number,
  kind = "VIEW",
) {
  // A tab left open should not read as an hour of selling; the beacon caps each flush and this
  // caps whatever arrives regardless.
  const capped = Math.min(600, Math.max(0, Math.round(seconds)));
  if (capped <= 0) return null;
  return prisma.staffTouch.create({ data: { leadId, staffName, seconds: capped, kind } });
}

export async function discardAgentDraft(messageId: string, staffName: string) {
  const draft = await prisma.leadMessage.findUniqueOrThrow({ where: { id: messageId } });
  if (draft.status !== "DRAFT") throw new LeadInputError("That message was already handled.");
  await prisma.leadMessage.delete({ where: { id: messageId } });
  await logEvent(draft.leadId, "AGENT_DRAFT_DISCARDED", `${staffName} discarded an agent draft`, draft.body);
}

/** Starts the post-sale cadence once a lead becomes a member. */
export async function startMemberNurture(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.optedOutAt) return false;
  const sequence = await prisma.sequence.findUnique({ where: { key: MEMBER_NURTURE_SEQUENCE } });
  if (!sequence) return false;
  await enrollLead(leadId, MEMBER_NURTURE_SEQUENCE);
  return true;
}
