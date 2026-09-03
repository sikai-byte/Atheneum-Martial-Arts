import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPrice, formatRelative } from "@/lib/format";
import { memberValues, studioMetrics } from "@/lib/members/ltv";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAST_DUE: "bg-red-100 text-red-800",
  FROZEN: "bg-amber-100 text-amber-900",
  CANCELLED: "bg-slate-200 text-slate-700",
  NONE: "bg-slate-100 text-slate-600",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[status] ?? STATUS_STYLES.NONE
      }`}
    >
      {status.toLowerCase().replace("_", " ")}
    </span>
  );
}

export default async function MembersPage() {
  await requireCoach();
  const now = new Date();
  const [values, metrics, plans] = await Promise.all([
    memberValues(now),
    studioMetrics(now),
    prisma.membershipPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const ranked = [...values].sort((a, b) => b.ltvCents - a.ltvCents);
  const stats = [
    { label: "Active members", value: String(metrics.activeMembers) },
    { label: "Monthly recurring", value: formatPrice(metrics.mrrCents) },
    { label: "Collected this month", value: formatPrice(metrics.collectedThisMonthCents) },
    { label: "Average LTV", value: formatPrice(metrics.avgLtvCents) },
    {
      label: "Past due",
      value: String(metrics.pastDueMembers),
      hint: metrics.pastDueMembers > 0 ? "Card failed — needs a nudge" : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="mt-1 text-slate-600">
            Dues, payment history, and lifetime value for everyone training here.
          </p>
        </div>
        <Link
          href="/coach/growth"
          className="btn btn-secondary btn-md"
        >
          Growth &amp; LTV by source
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="eyebrow">
              {stat.label}
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{stat.value}</p>
            {stat.hint && <p className="text-xs text-slate-500">{stat.hint}</p>}
          </div>
        ))}
      </section>

      {ranked.length === 0 ? (
        <p className="card p-4 text-slate-600">
          No members yet. Sign a lead up from their lead page to create the first member record.
        </p>
      ) : (
        <ul className="space-y-3">
          {ranked.map((member) => (
            <li key={member.profileId}>
              <Link
                href={`/coach/members/${member.profileId}`}
                className="block card p-4 hover:border-slate-400"
              >
                <div className="card-head">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{member.name}</p>
                    <StatusPill status={member.status} />
                    {member.isChild && (
                      <span className="text-xs font-semibold text-slate-500">kid</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {member.planName ?? "No plan"}
                    {member.monthlyCents > 0 && ` · ${formatPrice(member.monthlyCents)}/mo`}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {formatPrice(member.ltvCents)} lifetime
                  </span>
                  <span>{member.monthsActive} mo with us</span>
                  <span>Joined {formatRelative(member.joinedAt, now)}</span>
                  {member.lastPaymentAt ? (
                    <span>Last payment {formatRelative(member.lastPaymentAt, now)}</span>
                  ) : (
                    <span className="text-amber-700">No payment recorded</span>
                  )}
                  {member.source && (
                    <span>
                      From {member.source.toLowerCase().replace("_", " ")}
                      {member.campaign && ` · ${member.campaign}`}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="card p-4">
        <h2 className="card-title">Membership plans</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {plans.map((plan) => (
            <li key={plan.id}>
              {plan.name} — {formatPrice(plan.priceCents)}
              {plan.punchPassClasses
                ? ` for ${plan.punchPassClasses} classes`
                : ` / ${plan.billingPeriod.toLowerCase()}`}
              {plan.stripePriceId ? " · linked to Stripe" : ""}
            </li>
          ))}
          {plans.length === 0 && <li>No active plans yet.</li>}
        </ul>
      </section>
    </div>
  );
}
