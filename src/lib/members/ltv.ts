import { prisma } from "../db";

export type MemberValue = {
  profileId: string;
  name: string;
  isChild: boolean;
  joinedAt: Date;
  leftAt: Date | null;
  status: string; // ACTIVE | PAST_DUE | FROZEN | CANCELLED | NONE
  planName: string | null;
  monthlyCents: number;
  ltvCents: number; // everything ever collected from this member
  monthsActive: number;
  lastPaymentAt: Date | null;
  source: string | null; // lead source, when the member came from a tracked lead
  campaign: string | null;
};

/** Whole months between two dates, floored at 1 so a brand-new member isn't divided by zero. */
export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    (to.getDate() >= from.getDate() ? 0 : -1);
  return Math.max(1, months + 1);
}

/**
 * Per-member lifetime value: every PAID payment, plus where the member came from.
 * Retail orders are counted through `Payment` rows (kind RETAIL) rather than `Order`,
 * so cash-at-the-desk and Stripe both land in one ledger.
 */
export async function memberValues(now = new Date()): Promise<MemberValue[]> {
  const profiles = await prisma.memberProfile.findMany({
    include: {
      lead: { select: { source: true, campaign: true } },
      payments: { where: { status: "PAID" }, orderBy: { paidAt: "desc" } },
      memberships: { orderBy: { startedAt: "desc" }, include: { plan: true } },
    },
    orderBy: { name: "asc" },
  });

  return profiles.map((profile) => {
    const current =
      profile.memberships.find((m) => m.status === "ACTIVE" || m.status === "PAST_DUE") ??
      profile.memberships[0] ??
      null;
    const ltvCents = profile.payments.reduce((sum, p) => sum + p.amountCents, 0);
    return {
      profileId: profile.id,
      name: profile.name,
      isChild: profile.isChild,
      joinedAt: profile.joinedAt,
      leftAt: profile.leftAt,
      status: current?.status ?? "NONE",
      planName: current?.plan.name ?? null,
      monthlyCents: current && current.status !== "CANCELLED" ? current.priceCents : 0,
      ltvCents,
      monthsActive: monthsBetween(profile.joinedAt, profile.leftAt ?? now),
      lastPaymentAt: profile.payments[0]?.paidAt ?? null,
      source: profile.lead?.source ?? null,
      campaign: profile.lead?.campaign ?? null,
    };
  });
}

export type SourceRollup = {
  source: string;
  campaign: string | null;
  leads: number;
  contacted: number;
  members: number;
  activeMembers: number;
  revenueCents: number;
  conversionRate: number; // members / leads
  avgLtvCents: number; // revenue / members
};

/**
 * Leads → members → revenue, grouped by where the lead came from. This is the number that
 * decides which ads to keep running: cost per lead is meaningless next to LTV per lead source.
 */
export async function sourceRollups(): Promise<SourceRollup[]> {
  const leads = await prisma.lead.findMany({
    select: {
      source: true,
      campaign: true,
      firstContactedAt: true,
      profile: {
        select: {
          payments: { where: { status: "PAID" }, select: { amountCents: true } },
          memberships: { select: { status: true } },
        },
      },
    },
  });

  const buckets = new Map<string, SourceRollup>();
  for (const lead of leads) {
    const key = `${lead.source}::${lead.campaign ?? ""}`;
    const bucket =
      buckets.get(key) ??
      {
        source: lead.source,
        campaign: lead.campaign,
        leads: 0,
        contacted: 0,
        members: 0,
        activeMembers: 0,
        revenueCents: 0,
        conversionRate: 0,
        avgLtvCents: 0,
      };
    bucket.leads += 1;
    if (lead.firstContactedAt) bucket.contacted += 1;
    if (lead.profile) {
      bucket.members += 1;
      if (lead.profile.memberships.some((m) => m.status === "ACTIVE" || m.status === "PAST_DUE")) {
        bucket.activeMembers += 1;
      }
      bucket.revenueCents += lead.profile.payments.reduce((sum, p) => sum + p.amountCents, 0);
    }
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .map((b) => ({
      ...b,
      conversionRate: b.leads > 0 ? b.members / b.leads : 0,
      avgLtvCents: b.members > 0 ? Math.round(b.revenueCents / b.members) : 0,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents || b.leads - a.leads);
}

export type StudioMetrics = {
  activeMembers: number;
  pastDueMembers: number;
  mrrCents: number;
  collectedThisMonthCents: number;
  avgLtvCents: number;
  membersFromLeads: number;
};

export async function studioMetrics(now = new Date()): Promise<StudioMetrics> {
  const values = await memberValues(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const collected = await prisma.payment.aggregate({
    where: { status: "PAID", paidAt: { gte: monthStart } },
    _sum: { amountCents: true },
  });
  const withValue = values.filter((v) => v.ltvCents > 0);

  return {
    activeMembers: values.filter((v) => v.status === "ACTIVE").length,
    pastDueMembers: values.filter((v) => v.status === "PAST_DUE").length,
    mrrCents: values.reduce((sum, v) => sum + (v.status === "ACTIVE" ? v.monthlyCents : 0), 0),
    collectedThisMonthCents: collected._sum.amountCents ?? 0,
    avgLtvCents:
      withValue.length > 0
        ? Math.round(withValue.reduce((sum, v) => sum + v.ltvCents, 0) / withValue.length)
        : 0,
    membersFromLeads: values.filter((v) => v.source).length,
  };
}
