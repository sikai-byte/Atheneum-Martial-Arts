"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "./auth";
import { prisma } from "./db";
import { ageGroupFromRow, parseDate, parseLeadCsv } from "./leads/csv";
import {
  dispatchDueFollowUps,
  enrollLead,
  handleInboundSms,
  intakeLead,
  LeadInputError,
  optOutLead,
  pauseSequence,
  REACTIVATION_SEQUENCE,
  resumeSequence,
  sendManualSms,
  setLeadStatus,
} from "./leads/engine";
import { investigateAndSave } from "./leads/investigate";

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
    },
    create: { id: "default" },
  });
  revalidatePath("/coach/leads");
  revalidatePath("/coach/leads/settings");
  return { message: "Saved." };
}
