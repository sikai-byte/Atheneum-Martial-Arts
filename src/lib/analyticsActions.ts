"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "./auth";
import { prisma } from "./db";

export type FormState = { error?: string; message?: string };

function parseDollars(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/**
 * Ad spend is the one funnel input nothing else can supply — no ad platform is connected, so cost
 * per lead is unknowable until someone types what they spent.
 */
export async function saveAdSpendAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const coach = await requireCoach();
  const source = String(formData.get("source") ?? "").trim().toUpperCase();
  const campaign = String(formData.get("campaign") ?? "").trim();
  const amountCents = parseDollars(String(formData.get("amount") ?? ""));
  const periodStart = new Date(String(formData.get("periodStart") ?? ""));
  const periodEnd = new Date(String(formData.get("periodEnd") ?? ""));

  if (!source) return { error: "Which source was the money spent on?" };
  if (amountCents === null) return { error: "Enter the amount spent, e.g. 450." };
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return { error: "Give the period the spend covers." };
  }
  if (periodEnd < periodStart) return { error: "The period ends before it starts." };

  await prisma.adSpend.create({
    data: {
      source,
      campaign: campaign || null,
      amountCents,
      periodStart,
      // Spend dated to a day should cover that whole day, not stop at midnight.
      periodEnd: new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000 - 1),
      note: String(formData.get("note") ?? "").trim(),
      recordedBy: coach.name,
    },
  });
  revalidatePath("/coach/growth");
  revalidatePath("/coach/growth/spend");
  return { message: "Spend recorded." };
}

export async function deleteAdSpendAction(id: string) {
  await requireCoach();
  await prisma.adSpend.delete({ where: { id } });
  revalidatePath("/coach/growth");
  revalidatePath("/coach/growth/spend");
}
