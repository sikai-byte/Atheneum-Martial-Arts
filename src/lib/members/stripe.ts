import crypto from "crypto";
import { prisma } from "../db";
import { getBotConfig } from "../leads/config";
import { sendOutbound } from "../leads/outbox";
import { firstName } from "../leads/phone";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Stripe signs `${timestamp}.${rawBody}` with the endpoint secret and sends it as
 * `stripe-signature: t=...,v1=...`. Verified here rather than with the SDK so the app keeps
 * running (payments recorded by hand) for a studio that hasn't set Stripe up yet.
 */
export function verifyStripeSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!header) return false;

  const parts = new Map(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim() ?? "", value?.trim() ?? ""] as [string, string];
    }),
  );
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;

  // Reject anything older than five minutes so a captured request can't be replayed.
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type StripeEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      customer?: string;
      subscription?: string;
      amount_paid?: number;
      amount_due?: number;
      currency?: string;
      number?: string;
      hosted_invoice_url?: string;
    };
  };
};

async function membershipFor(object: NonNullable<StripeEvent["data"]>["object"]) {
  if (!object) return null;
  if (object.subscription) {
    const bySubscription = await prisma.membership.findUnique({
      where: { stripeSubscriptionId: object.subscription },
    });
    if (bySubscription) return bySubscription;
  }
  if (object.customer) {
    return prisma.membership.findFirst({
      where: { stripeCustomerId: object.customer },
      orderBy: { startedAt: "desc" },
    });
  }
  return null;
}

export type StripeIngestResult = {
  handled: boolean;
  reason?: string;
};

/**
 * Turns Stripe invoice events into ledger rows and dues state. `invoice.payment_failed` is the
 * valuable one: it flips the membership to PAST_DUE and texts the member a self-serve link, which
 * is the recovery loop a manual spreadsheet can't do.
 */
export async function ingestStripeEvent(event: StripeEvent): Promise<StripeIngestResult> {
  const object = event.data?.object;
  const type = event.type ?? "";
  if (!object) return { handled: false, reason: "no event object" };

  const membership = await membershipFor(object);
  if (!membership) return { handled: false, reason: "no membership matches this customer" };

  if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
    const amountCents = object.amount_paid ?? object.amount_due ?? membership.priceCents;
    const externalId = object.id ?? `${event.id ?? "stripe"}-${membership.id}`;
    const existing = await prisma.payment.findUnique({ where: { externalId } });
    if (existing) return { handled: true, reason: "already recorded" };

    await prisma.payment.create({
      data: {
        profileId: membership.profileId,
        membershipId: membership.id,
        amountCents,
        kind: "DUES",
        method: "STRIPE",
        status: "PAID",
        description: object.number ? `Stripe invoice ${object.number}` : "Stripe invoice",
        externalId,
      },
    });
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: "ACTIVE", nextInvoiceAt: null },
    });
    return { handled: true };
  }

  if (type === "invoice.payment_failed") {
    const externalId = object.id ? `failed-${object.id}` : null;
    if (externalId) {
      const existing = await prisma.payment.findUnique({ where: { externalId } });
      if (existing) return { handled: true, reason: "already recorded" };
    }
    await prisma.payment.create({
      data: {
        profileId: membership.profileId,
        membershipId: membership.id,
        amountCents: object.amount_due ?? membership.priceCents,
        kind: "DUES",
        method: "STRIPE",
        status: "FAILED",
        description: "Card declined",
        externalId,
      },
    });
    await prisma.membership.update({ where: { id: membership.id }, data: { status: "PAST_DUE" } });
    await notifyPastDue(membership.profileId, object.hosted_invoice_url ?? null);
    return { handled: true };
  }

  if (type === "customer.subscription.deleted") {
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: "CANCELLED", endedAt: new Date(), cancelReason: "Cancelled in Stripe" },
    });
    await prisma.memberProfile.update({
      where: { id: membership.profileId },
      data: { leftAt: new Date() },
    });
    return { handled: true };
  }

  return { handled: false, reason: `unhandled event type ${type}` };
}

/** Texts the member (via the phone we captured on their lead) that their card failed. */
async function notifyPastDue(profileId: string, invoiceUrl: string | null) {
  const profile = await prisma.memberProfile.findUnique({
    where: { id: profileId },
    include: { lead: { select: { id: true, fullName: true } } },
  });
  const lead = profile?.lead;
  if (!profile || !lead) return;

  const config = await getBotConfig();
  const link = invoiceUrl ?? process.env.STRIPE_BILLING_PORTAL_URL ?? "";
  const body = [
    `Hi ${firstName(lead.fullName)}, it's ${config.studioName}.`,
    `This month's dues for ${profile.name} didn't go through.`,
    link ? `You can update the card here: ${link}` : "Can you stop by the desk to update the card?",
  ].join(" ");
  // Through the outbox like every other lead-facing text: a Stripe retry storm can't produce
  // duplicate texts, and a provider error leaves the notice on the thread for staff to retry.
  await sendOutbound({ leadId: lead.id, body, actor: "AUTOMATION" });
}
