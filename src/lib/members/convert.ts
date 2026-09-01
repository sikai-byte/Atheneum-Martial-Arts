import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { firstName } from "../leads/phone";

export class ConvertLeadError extends Error {}

export type ConvertLeadInput = {
  leadId: string;
  planId: string;
  /** Who the membership is for. Kid leads sign up the child, adults sign up themselves. */
  memberName?: string;
  isChild?: boolean;
  birthYear?: number;
  signupFeeCents?: number;
  firstPaymentCents?: number;
  /** Create a portal login for the paying adult (parent or member). */
  createLogin?: boolean;
  loginEmail?: string;
  staffName: string;
};

export type ConvertLeadResult = {
  profileId: string;
  membershipId: string;
  /** Only set when a login was created — show it to staff once, it isn't stored in plaintext. */
  temporaryPassword: string | null;
};

function generatePassword(): string {
  // Readable temporary password: staff reads it out at the desk, member changes it later.
  const words = ["kick", "guard", "sweep", "mount", "clinch", "bridge", "roll", "spar"];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Turns a won lead into a paying member without losing where they came from: the lead row stays
 * put, the profile points back at it, and every payment recorded later rolls up to that lead's
 * source and campaign. That link is the whole reason to run the CRM and the portal in one app.
 */
export async function convertLeadToMember(input: ConvertLeadInput): Promise<ConvertLeadResult> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: input.leadId },
    include: { profile: true },
  });
  if (lead.profile) {
    throw new ConvertLeadError(`${lead.fullName} is already a member.`);
  }
  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: input.planId } });

  const isChild = input.isChild ?? lead.ageGroup === "KID";
  const memberName = (input.memberName || (isChild ? lead.childName : lead.fullName) || lead.fullName).trim();
  const loginEmail = (input.loginEmail || lead.email || "").trim().toLowerCase();
  const wantsLogin = Boolean(input.createLogin && loginEmail);

  if (wantsLogin) {
    const existing = await prisma.user.findUnique({ where: { email: loginEmail } });
    if (existing) {
      throw new ConvertLeadError(
        `${loginEmail} already has a portal login — add the member to that household instead.`,
      );
    }
  }

  const temporaryPassword = wantsLogin ? generatePassword() : null;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: { name: `${firstName(lead.fullName)}'s household` },
    });

    if (temporaryPassword) {
      await tx.user.create({
        data: {
          email: loginEmail,
          passwordHash: await bcrypt.hash(temporaryPassword, 10),
          name: lead.fullName,
          role: isChild ? "PARENT" : "MEMBER",
          householdId: household.id,
        },
      });
    }

    const profile = await tx.memberProfile.create({
      data: {
        name: memberName,
        isChild,
        birthYear: input.birthYear ?? null,
        membershipPlan: plan.name,
        membershipType: plan.punchPassClasses ? "PUNCH_PASS" : "MONTHLY",
        punchPassTotal: plan.punchPassClasses ?? null,
        householdId: household.id,
        joinedAt: now,
        leadId: lead.id,
      },
    });

    const membership = await tx.membership.create({
      data: {
        profileId: profile.id,
        planId: plan.id,
        priceCents: plan.priceCents,
        billingDay: plan.punchPassClasses ? null : now.getDate(),
        nextInvoiceAt: plan.punchPassClasses
          ? null
          : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
      },
    });

    const payments: { amountCents: number; kind: string; description: string }[] = [];
    if (input.signupFeeCents && input.signupFeeCents > 0) {
      payments.push({
        amountCents: input.signupFeeCents,
        kind: "SIGNUP_FEE",
        description: "Signup fee",
      });
    }
    if (input.firstPaymentCents && input.firstPaymentCents > 0) {
      payments.push({
        amountCents: input.firstPaymentCents,
        kind: plan.punchPassClasses ? "PUNCH_PASS" : "DUES",
        description: `${plan.name} — first payment`,
      });
    }
    for (const payment of payments) {
      await tx.payment.create({
        data: {
          ...payment,
          profileId: profile.id,
          membershipId: membership.id,
          method: "MANUAL",
          recordedBy: input.staffName,
        },
      });
    }

    // Nothing automated should text someone who just signed up.
    await tx.followUpTask.updateMany({
      where: { leadId: lead.id, status: "PENDING" },
      data: { status: "CANCELLED", completedAt: now, lastError: "Lead converted to member" },
    });
    await tx.lead.update({
      where: { id: lead.id },
      data: { status: "WON", pausedAt: lead.pausedAt ?? now },
    });
    await tx.leadEvent.create({
      data: {
        leadId: lead.id,
        type: "CONVERTED",
        summary: `Signed up ${memberName} on ${plan.name}`,
        detail: `Converted by ${input.staffName}`,
      },
    });

    return { profileId: profile.id, membershipId: membership.id };
  });

  return { ...result, temporaryPassword };
}

export type RecordPaymentInput = {
  profileId: string;
  amountCents: number;
  kind: string;
  method: string;
  description?: string;
  paidAt?: Date;
  recordedBy: string;
};

export async function recordPayment(input: RecordPaymentInput) {
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    throw new ConvertLeadError("Enter an amount greater than zero.");
  }
  const membership = await prisma.membership.findFirst({
    where: { profileId: input.profileId, status: { in: ["ACTIVE", "PAST_DUE"] } },
    orderBy: { startedAt: "desc" },
  });
  return prisma.payment.create({
    data: {
      profileId: input.profileId,
      membershipId: membership?.id ?? null,
      amountCents: Math.round(input.amountCents),
      kind: input.kind,
      method: input.method,
      description: input.description ?? "",
      paidAt: input.paidAt ?? new Date(),
      recordedBy: input.recordedBy,
    },
  });
}

export async function setMembershipStatus(membershipId: string, status: string, reason?: string) {
  const ending = status === "CANCELLED";
  const membership = await prisma.membership.update({
    where: { id: membershipId },
    data: {
      status,
      endedAt: ending ? new Date() : null,
      cancelReason: ending ? (reason ?? null) : null,
    },
  });
  await prisma.memberProfile.update({
    where: { id: membership.profileId },
    data: { leftAt: ending ? new Date() : null },
  });
  return membership;
}
