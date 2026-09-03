import { prisma } from "../db";

/**
 * Funnel telemetry. Every number here is derived from rows the app already writes — leads,
 * messages, trials, memberships, payments — with two exceptions that cannot be inferred and are
 * entered by hand or measured: ad spend (`AdSpend`) and staff attention (`StaffTouch`).
 *
 * Rules that keep the numbers honest:
 * - A lead belongs to the window by `createdAt` (when we got them), not `submittedAt` (which for
 *   imports is the original enquiry date, often years old).
 * - Rates only ever divide by the population that could have produced the numerator, and the
 *   denominator is reported alongside every rate so a 100% built on two leads is obvious.
 * - Anything unknown is counted as unknown rather than as a failure: a trial nobody marked is not
 *   a no-show, so it is excluded from the show rate and surfaced separately.
 */

export const REACTIVATION_KEY = "REACTIVATION";

export type Rate = { rate: number; numerator: number; denominator: number };

function rate(numerator: number, denominator: number): Rate {
  return { rate: denominator > 0 ? numerator / denominator : 0, numerator, denominator };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type FunnelMetrics = {
  window: { from: string; to: string; days: number | null };
  leads: number;

  /** Lead created → first text out. The 5-minute promise lives or dies here. */
  firstContact: {
    contacted: Rate;
    medianMinutes: number | null;
    p90Minutes: number | null;
    withinFiveMinutes: Rate;
    neverContacted: number;
  };

  /** Did the conversation ever start, and where did it get to. */
  responseRate: Rate;
  leadToTrial: Rate;
  trialShowRate: Rate;
  trialsAwaitingAttendance: number;
  trialToMembership: Rate;
  leadToMembership: Rate;
  medianDaysToMembership: number | null;

  /** How much of the selling the agent actually did. */
  agent: {
    conversations: number;
    handoffRate: Rate;
    bookedRate: Rate;
    fullyHandled: Rate;
    draftsEditedBeforeSending: Rate;
  };

  reactivation: {
    enrolled: number;
    replied: Rate;
    booked: Rate;
    won: Rate;
  };

  staffTime: {
    totalMinutes: number;
    leadsTouched: number;
    medianMinutesPerLead: number | null;
    minutesPerMember: number | null;
  };

  revenue: {
    fromWindowLeadsCents: number;
    membersFromWindowLeads: number;
    avgLtvCents: number;
  };
};

export type Window = { from: Date; to: Date; days: number | null };

/** `days = null` means "everything ever". */
export function windowFor(days: number | null, now = new Date()): Window {
  return {
    from: days === null ? new Date(0) : new Date(now.getTime() - days * DAY),
    to: now,
    days,
  };
}

export async function funnelMetrics(window: Window, now = new Date()): Promise<FunnelMetrics> {
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: window.from, lte: window.to } },
    select: {
      id: true,
      createdAt: true,
      status: true,
      firstContactedAt: true,
      lastInboundAt: true,
      handoffAt: true,
      trials: {
        select: { status: true, session: { select: { startsAt: true } } },
      },
      messages: {
        select: {
          direction: true,
          status: true,
          automated: true,
          sentBy: true,
          agentAction: true,
          staffEdited: true,
        },
      },
      tasks: { select: { sequenceKey: true } },
      staffTouches: { select: { seconds: true } },
      profile: {
        select: {
          joinedAt: true,
          memberships: { select: { startedAt: true } },
          payments: { where: { status: "PAID" }, select: { amountCents: true } },
        },
      },
    },
  });

  const contacted = leads.filter((l) => l.firstContactedAt);
  const latencies = contacted.map((l) => (l.firstContactedAt!.getTime() - l.createdAt.getTime()) / MINUTE);
  // Imported leads are texted on the next dispatcher tick, but a negative latency would mean the
  // clock moved; clamp rather than letting one bad row drag the median.
  const cleanLatencies = latencies.map((m) => Math.max(0, m));

  const conversations = leads.filter((l) => l.messages.some((m) => m.direction === "INBOUND"));
  const withTrial = leads.filter((l) => l.trials.some((t) => t.status !== "CANCELLED"));

  const pastTrials = leads.flatMap((l) =>
    l.trials.filter((t) => t.status !== "CANCELLED" && t.session.startsAt < now),
  );
  const attended = pastTrials.filter((t) => t.status === "ATTENDED").length;
  const noShow = pastTrials.filter((t) => t.status === "NO_SHOW").length;
  const unmarked = pastTrials.filter((t) => t.status === "BOOKED").length;

  const isMember = (lead: (typeof leads)[number]) =>
    Boolean(lead.profile && lead.profile.memberships.length > 0);
  const members = leads.filter(isMember);
  const daysToMembership = members
    .map((l) => {
      const started = l.profile!.memberships
        .map((m) => m.startedAt.getTime())
        .sort((a, b) => a - b)[0];
      return (started - l.createdAt.getTime()) / DAY;
    })
    .map((d) => Math.max(0, d));

  const agentConversations = leads.filter((l) => l.messages.some((m) => m.agentAction));
  const agentDraftsSent = leads.flatMap((l) =>
    l.messages.filter((m) => m.agentAction && m.sentBy && m.status === "SENT"),
  );
  // "Fully handled" means every outbound text on the thread was written and sent by the agent with
  // no staff involvement. In DRAFT mode this is 0 by design, which is the point: it measures how
  // close the agent is to being trusted on autopilot.
  const fullyHandled = conversations.filter((l) => {
    const outbound = l.messages.filter((m) => m.direction === "OUTBOUND" && m.status === "SENT");
    return outbound.length > 0 && outbound.every((m) => m.automated && !m.sentBy);
  });

  const reactivated = leads.filter((l) => l.tasks.some((t) => t.sequenceKey === REACTIVATION_KEY));

  const touched = leads.filter((l) => l.staffTouches.length > 0);
  const secondsPerLead = touched.map((l) => l.staffTouches.reduce((sum, t) => sum + t.seconds, 0));
  const totalSeconds = secondsPerLead.reduce((sum, s) => sum + s, 0);

  const revenueCents = members.reduce(
    (sum, l) => sum + l.profile!.payments.reduce((s, p) => s + p.amountCents, 0),
    0,
  );

  return {
    window: { from: window.from.toISOString(), to: window.to.toISOString(), days: window.days },
    leads: leads.length,

    firstContact: {
      contacted: rate(contacted.length, leads.length),
      medianMinutes: median(cleanLatencies),
      p90Minutes: percentile(cleanLatencies, 90),
      withinFiveMinutes: rate(cleanLatencies.filter((m) => m <= 5).length, contacted.length),
      neverContacted: leads.length - contacted.length,
    },

    responseRate: rate(conversations.length, contacted.length),
    leadToTrial: rate(withTrial.length, leads.length),
    trialShowRate: rate(attended, attended + noShow),
    trialsAwaitingAttendance: unmarked,
    trialToMembership: rate(withTrial.filter(isMember).length, withTrial.length),
    leadToMembership: rate(members.length, leads.length),
    medianDaysToMembership: median(daysToMembership),

    agent: {
      conversations: agentConversations.length,
      handoffRate: rate(
        conversations.filter((l) => l.handoffAt).length,
        conversations.length,
      ),
      bookedRate: rate(
        agentConversations.filter((l) => l.trials.some((t) => t.status !== "CANCELLED")).length,
        agentConversations.length,
      ),
      fullyHandled: rate(fullyHandled.length, conversations.length),
      draftsEditedBeforeSending: rate(
        agentDraftsSent.filter((m) => m.staffEdited).length,
        agentDraftsSent.length,
      ),
    },

    reactivation: {
      enrolled: reactivated.length,
      replied: rate(reactivated.filter((l) => l.lastInboundAt).length, reactivated.length),
      booked: rate(
        reactivated.filter((l) => l.trials.some((t) => t.status !== "CANCELLED")).length,
        reactivated.length,
      ),
      won: rate(reactivated.filter(isMember).length, reactivated.length),
    },

    staffTime: {
      totalMinutes: Math.round(totalSeconds / 60),
      leadsTouched: touched.length,
      medianMinutesPerLead: (() => {
        const m = median(secondsPerLead);
        return m === null ? null : Math.round((m / 60) * 10) / 10;
      })(),
      minutesPerMember:
        members.length > 0 ? Math.round(totalSeconds / 60 / members.length) : null,
    },

    revenue: {
      fromWindowLeadsCents: revenueCents,
      membersFromWindowLeads: members.length,
      avgLtvCents: members.length > 0 ? Math.round(revenueCents / members.length) : 0,
    },
  };
}

export type SourceEconomics = {
  source: string;
  campaign: string | null;
  leads: number;
  contacted: number;
  trials: number;
  members: number;
  revenueCents: number;
  spendCents: number;
  costPerLeadCents: number | null;
  costPerMemberCents: number | null;
  roas: number | null; // revenue ÷ spend
};

/**
 * Cost of a source next to what it produced. Spend rows are matched to a source (and campaign,
 * when the row names one) if their period overlaps the window at all — partial overlap is counted
 * in full, so a monthly spend row viewed through a 7-day window overstates cost. Keep spend
 * periods aligned with how you read the dashboard.
 *
 * Revenue is every dollar ever collected from members who came from these leads, not just dollars
 * inside the window: a lead acquired in the window keeps earning after it.
 */
export async function sourceEconomics(window: Window): Promise<SourceEconomics[]> {
  const [leads, spend] = await Promise.all([
    prisma.lead.findMany({
      where: { createdAt: { gte: window.from, lte: window.to } },
      select: {
        source: true,
        campaign: true,
        firstContactedAt: true,
        trials: { select: { status: true } },
        profile: {
          select: {
            memberships: { select: { id: true } },
            payments: { where: { status: "PAID" }, select: { amountCents: true } },
          },
        },
      },
    }),
    prisma.adSpend.findMany({
      where: { periodStart: { lte: window.to }, periodEnd: { gte: window.from } },
    }),
  ]);

  const buckets = new Map<string, SourceEconomics>();
  const bucket = (source: string, campaign: string | null) => {
    const key = `${source}::${campaign ?? ""}`;
    const existing = buckets.get(key);
    if (existing) return existing;
    const fresh: SourceEconomics = {
      source,
      campaign,
      leads: 0,
      contacted: 0,
      trials: 0,
      members: 0,
      revenueCents: 0,
      spendCents: 0,
      costPerLeadCents: null,
      costPerMemberCents: null,
      roas: null,
    };
    buckets.set(key, fresh);
    return fresh;
  };

  for (const lead of leads) {
    const row = bucket(lead.source, lead.campaign);
    row.leads += 1;
    if (lead.firstContactedAt) row.contacted += 1;
    if (lead.trials.some((t) => t.status !== "CANCELLED")) row.trials += 1;
    if (lead.profile && lead.profile.memberships.length > 0) {
      row.members += 1;
      row.revenueCents += lead.profile.payments.reduce((sum, p) => sum + p.amountCents, 0);
    }
  }

  for (const row of spend) {
    // Spend with no campaign covers the whole source, so it lands on every campaign bucket of that
    // source proportionally to leads; with a campaign it lands on that campaign alone.
    if (row.campaign) {
      bucket(row.source, row.campaign).spendCents += row.amountCents;
      continue;
    }
    const sourceRows = Array.from(buckets.values()).filter((b) => b.source === row.source);
    const totalLeads = sourceRows.reduce((sum, b) => sum + b.leads, 0);
    if (sourceRows.length === 0 || totalLeads === 0) {
      bucket(row.source, null).spendCents += row.amountCents;
      continue;
    }
    for (const target of sourceRows) {
      target.spendCents += Math.round(row.amountCents * (target.leads / totalLeads));
    }
  }

  return Array.from(buckets.values())
    .map((row) => ({
      ...row,
      costPerLeadCents: row.spendCents > 0 && row.leads > 0 ? Math.round(row.spendCents / row.leads) : null,
      costPerMemberCents:
        row.spendCents > 0 && row.members > 0 ? Math.round(row.spendCents / row.members) : null,
      roas: row.spendCents > 0 ? row.revenueCents / row.spendCents : null,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents || b.leads - a.leads);
}

/**
 * Stores today's metrics once per studio-local day. The live numbers keep moving as leads convert,
 * so without this there is no way to answer "were we better in March than in January?".
 */
export async function captureSnapshot(
  options: { windowDays?: number; timezone?: string; now?: Date } = {},
): Promise<{ captured: boolean; capturedOn: string }> {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? 30;
  const capturedOn = new Intl.DateTimeFormat("en-CA", {
    timeZone: options.timezone ?? "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const existing = await prisma.metricSnapshot.findUnique({ where: { capturedOn } });
  if (existing) return { captured: false, capturedOn };

  const metrics = await funnelMetrics(windowFor(windowDays, now), now);
  await prisma.metricSnapshot.create({
    data: { capturedOn, windowDays, payload: JSON.stringify(metrics) },
  });
  return { captured: true, capturedOn };
}
