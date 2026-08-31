"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "./auth";
import {
  ConvertLeadError,
  convertLeadToMember,
  recordPayment,
  setMembershipStatus,
} from "./members/convert";

export type FormState = { error?: string; message?: string };

function errorMessage(error: unknown) {
  if (error instanceof ConvertLeadError) return error.message;
  console.error("[members] action failed", error);
  return "Something went wrong. Please try again.";
}

function refresh(profileId?: string) {
  revalidatePath("/coach/members");
  revalidatePath("/coach/growth");
  revalidatePath("/coach/leads");
  if (profileId) revalidatePath(`/coach/members/${profileId}`);
}

function dollarsToCents(value: FormDataEntryValue | null): number {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export async function convertLeadAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const coach = await requireCoach();
  const leadId = String(formData.get("leadId") ?? "");
  let profileId: string;
  let temporaryPassword: string | null;
  try {
    const result = await convertLeadToMember({
      leadId,
      planId: String(formData.get("planId") ?? ""),
      memberName: String(formData.get("memberName") ?? "") || undefined,
      isChild: formData.get("isChild") === "on",
      birthYear: Number.parseInt(String(formData.get("birthYear") ?? ""), 10) || undefined,
      signupFeeCents: dollarsToCents(formData.get("signupFee")),
      firstPaymentCents: dollarsToCents(formData.get("firstPayment")),
      createLogin: formData.get("createLogin") === "on",
      loginEmail: String(formData.get("loginEmail") ?? "") || undefined,
      staffName: coach.name,
    });
    profileId = result.profileId;
    temporaryPassword = result.temporaryPassword;
  } catch (error) {
    return { error: errorMessage(error) };
  }

  refresh(profileId);
  revalidatePath(`/coach/leads/${leadId}`);
  if (temporaryPassword) {
    // Shown once on the member page: the hash is all that's stored.
    redirect(`/coach/members/${profileId}?newLogin=${encodeURIComponent(temporaryPassword)}`);
  }
  redirect(`/coach/members/${profileId}`);
}

export async function recordPaymentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const coach = await requireCoach();
  const profileId = String(formData.get("profileId") ?? "");
  try {
    const payment = await recordPayment({
      profileId,
      amountCents: dollarsToCents(formData.get("amount")),
      kind: String(formData.get("kind") ?? "DUES"),
      method: String(formData.get("method") ?? "MANUAL"),
      description: String(formData.get("description") ?? ""),
      recordedBy: coach.name,
    });
    refresh(profileId);
    return { message: `Recorded $${(payment.amountCents / 100).toFixed(2)}.` };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function setMembershipStatusAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCoach();
  const membershipId = String(formData.get("membershipId") ?? "");
  const status = String(formData.get("status") ?? "ACTIVE");
  try {
    const membership = await setMembershipStatus(
      membershipId,
      status,
      String(formData.get("reason") ?? "") || undefined,
    );
    refresh(membership.profileId);
    return { message: `Membership set to ${status.toLowerCase().replace("_", " ")}.` };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
