"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "./auth";
import { prisma } from "./db";
import { ageGroupFromRow, parseDate, parseLeadCsv } from "./leads/csv";
import {
  approveAgentDraft,
  bookTrial,
  cancelTrial,
  discardAgentDraft,
  dispatchDueFollowUps,
  draftAgentReply,
  enrollLead,
  handleInboundSms,
  intakeLead,
  LeadInputError,
  markTrialAttendance,
  optOutLead,
  pauseSequence,
  REACTIVATION_SEQUENCE,
  resumeSequence,
  sendManualSms,
  setLeadStatus,
} from "./leads/engine";
import { investigateAndSave } from "./leads/investigate";
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_CATEGORIES } from "./leads/knowledge";
import { retryOutbound } from "./leads/outbox";

export type FormState = { error?: string; message?: string };

function refreshLead(leadId: string) {
  revalidatePath("/coach/leads");
  revalidatePath(`/coach/leads/${leadId}`);
}

function errorMessage(error: unknown) {
  if (error instanceof LeadInputError) return error.message;
  console.error("[leads] action failed", error);
  return "Something went wrong. Please try again.";
}

export async function createLeadAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCoach();
  const submittedAt = parseDate(String(formData.get("submittedAt") ?? "") || undefined);
  try {
    const { lead } = await intakeLead({
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      source: String(formData.get("source") ?? "MANUAL"),
      interest: String(formData.get("interest") ?? ""),
      ageGroup: String(formData.get("ageGroup") ?? "UNKNOWN"),
      childName: String(formData.get("childName") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      submittedAt,
      sequenceKey: String(formData.get("sequenceKey") ?? "") || undefined,
    });
    revalidatePath("/coach/leads");
    redirect(`/coach/leads/${lead.id}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return { error: errorMessage(error) };
  }
}

export async function importLeadsAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCoach();
  const text = String(formData.get("csv") ?? "");
  const sequenceKey = String(formData.get("sequenceKey") ?? REACTIVATION_SEQUENCE);
  const { rows } = parseLeadCsv(text);
  if (rows.length === 0) return { error: "No rows found. Paste at least one lead." };

  const batch = `import-${Date.now()}`;
  let imported = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const { ageGroup, childName } = ageGroupFromRow(row);
    const answers = Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => !["name", "phone", "email", "interest", "notes", "campaign", "formName", "submittedAt", "childName"].includes(key),
      ),
    );
    try {
      await intakeLead({
        fullName: row.name ?? "",
        phone: row.phone ?? "",
        email: row.email,
        source: "IMPORT",
        sourceRef: batch,
        campaign: row.campaign,
        formName: row.formName,
        interest: row.interest,
        ageGroup,
        childName,
        notes: row.notes ?? "",
        answers,
        submittedAt: parseDate(row.submittedAt),
        sequenceKey,
      });
      imported += 1;
    } catch (error) {
      failures.push(`${row.name ?? row.phone ?? "row"}: ${errorMessage(error)}`);
    }
  }

  revalidatePath("/coach/leads");
  return {
    message: `Imported ${imported} lead${imported === 1 ? "" : "s"} and started follow-up.${
      failures.length ? ` Skipped ${failures.length}: ${failures.slice(0, 3).join("; ")}` : ""
    }`,
    error: imported === 0 ? failures.join("; ") : undefined,
  };
}

export async function sendLeadSmsAction(
  leadId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const coach = await requireCoach();
  try {
    await sendManualSms(leadId, String(formData.get("body") ?? ""), coach.name);
    refreshLead(leadId);
    return { message: "Sent." };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function simulateInboundAction(
  leadId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCoach();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  try {
    await handleInboundSms(lead.phone, String(formData.get("body") ?? ""));
    refreshLead(leadId);
    return { message: "Recorded as an inbound reply." };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function draftAgentReplyAction(leadId: string) {
  await requireCoach();
  await draftAgentReply(leadId);
  refreshLead(leadId);
}

export async function approveDraftAction(
  leadId: string,
  messageId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const coach = await requireCoach();
  try {
    await approveAgentDraft(messageId, coach.name, String(formData.get("body") ?? ""));
    refreshLead(leadId);
    return { message: "Sent." };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/**
 * Sends a message that failed or was held, without the coach retyping it. Blocked messages are
 * re-checked rather than forced through, so retry can never become a way past an opt-out.
 */
export async function retryMessageAction(leadId: string, messageId: string): Promise<FormState> {
  const coach = await requireCoach();
  try {
    const outcome = await retryOutbound(messageId, coach.name);
    refreshLead(leadId);
    if (outcome.status === "SENT") return { message: "Sent." };
    if (outcome.status === "DEFERRED") return { message: outcome.reason };
    if (outcome.status === "BLOCKED") return { error: outcome.reason };
    if (outcome.status === "FAILED") return { error: outcome.error };
    return { error: "That message is already sending." };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function discardDraftAction(leadId: string, messageId: string) {
  const coach = await requireCoach();
  await discardAgentDraft(messageId, coach.name);
  refreshLead(leadId);
}

export async function bookTrialAction(
  leadId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const coach = await requireCoach();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return { error: "Pick a class first." };
  try {
    await bookTrial(leadId, sessionId, coach.name);
    refreshLead(leadId);
    return { message: "Booked." };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function cancelTrialAction(leadId: string, bookingId: string) {
  const coach = await requireCoach();
  await cancelTrial(bookingId, coach.name);
  refreshLead(leadId);
}

export async function markTrialAttendanceAction(
  leadId: string,
  bookingId: string,
  attended: boolean,
) {
  const coach = await requireCoach();
  await markTrialAttendance(bookingId, attended, coach.name);
  refreshLead(leadId);
  revalidatePath("/coach/growth");
}

export async function saveKnowledgeAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { error: "A knowledge item needs a title and a body." };

  const category = String(formData.get("category") ?? "FAQ");
  const audience = String(formData.get("audience") ?? "ALL");
  const data = {
    title,
    body,
    category: (KNOWLEDGE_CATEGORIES as readonly string[]).includes(category) ? category : "FAQ",
    audience: (KNOWLEDGE_AUDIENCES as readonly string[]).includes(audience) ? audience : "ALL",
    program: String(formData.get("program") ?? "").trim(),
    active: formData.get("active") === "on",
    verified: formData.get("verified") === "on",
  };

  if (id) {
    await prisma.knowledgeItem.update({ where: { id }, data });
  } else {
    await prisma.knowledgeItem.create({ data });
  }
  revalidatePath("/coach/leads/knowledge");
  return { message: id ? "Updated." : "Added." };
}

export async function deleteKnowledgeAction(id: string) {
  await requireCoach();
  await prisma.knowledgeItem.delete({ where: { id } });
  revalidatePath("/coach/leads/knowledge");
}

export async function investigateLeadAction(leadId: string) {
  await requireCoach();
  await investigateAndSave(leadId);
  refreshLead(leadId);
}

export async function pauseLeadAction(leadId: string) {
  const coach = await requireCoach();
  await pauseSequence(leadId, `Paused by ${coach.name}`);
  refreshLead(leadId);
}

export async function resumeLeadAction(leadId: string) {
  await requireCoach();
  await resumeSequence(leadId);
  refreshLead(leadId);
}

export async function optOutLeadAction(leadId: string) {
  const coach = await requireCoach();
  await optOutLead(leadId, `Marked do-not-text by ${coach.name}`);
  refreshLead(leadId);
}

export async function setLeadStatusAction(leadId: string, status: string) {
  await requireCoach();
  await setLeadStatus(leadId, status);
  refreshLead(leadId);
}

export async function enrollLeadAction(leadId: string, sequenceKey: string) {
  await requireCoach();
  await enrollLead(leadId, sequenceKey);
  await dispatchDueFollowUps({ leadId });
  refreshLead(leadId);
}

export async function runDispatcherAction() {
  await requireCoach();
  await dispatchDueFollowUps();
  revalidatePath("/coach/leads");
}

export async function updateBotConfigAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCoach();
  const hour = (name: string, fallback: number) => {
    const value = Number(formData.get(name));
    return Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
  };
  await prisma.botConfig.upsert({
    where: { id: "default" },
    update: {
      studioName: String(formData.get("studioName") ?? "").trim() || undefined,
      signature: String(formData.get("signature") ?? ""),
      timezone: String(formData.get("timezone") ?? "").trim() || undefined,
      quietHoursStart: hour("quietHoursStart", 21),
      quietHoursEnd: hour("quietHoursEnd", 8),
      autopilot: formData.get("autopilot") === "on",
      autoReplyEnabled: formData.get("autoReplyEnabled") === "on",
      bookingLink: String(formData.get("bookingLink") ?? "").trim() || undefined,
      agentEnabled: formData.get("agentEnabled") === "on",
      agentMode: formData.get("agentMode") === "AUTOPILOT" ? "AUTOPILOT" : "DRAFT",
      agentPersona: String(formData.get("agentPersona") ?? "").trim() || undefined,
      coachAlertPhone: String(formData.get("coachAlertPhone") ?? "").trim(),
      coachAlertHours: Math.min(168, Math.max(0, Number(formData.get("coachAlertHours")) || 0)),
      webChatEnabled: formData.get("webChatEnabled") === "on",
      webChatGreeting: String(formData.get("webChatGreeting") ?? "").trim() || undefined,
      webChatDailyCap: Math.min(10_000, Math.max(0, Number(formData.get("webChatDailyCap")) || 0)),
      webChatMaxTurns: Math.min(200, Math.max(1, Number(formData.get("webChatMaxTurns")) || 30)),
    },
    create: { id: "default" },
  });
  revalidatePath("/coach/leads");
  revalidatePath("/coach/leads/settings");
  revalidatePath("/coach/chats");
  return { message: "Saved." };
}
