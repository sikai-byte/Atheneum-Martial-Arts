import Link from "next/link";
import { funnelMetrics, sourceEconomics, windowFor, type Rate } from "@/lib/analytics/funnel";
import { requireCoach } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { studioMetrics } from "@/lib/members/ltv";

export const dynamic = "force-dynamic";

const RANGES = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "12 months", days: 365 },
  { label: "All time", days: null },
];

function pct(value: Rate) {
  if (value.denominator === 0) return "—";
  return `${Math.round(value.rate * 100)}%`;
}

function ofBase(value: Rate) {
  return `${value.numerator} of ${value.denominator}`;
}

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / (60 * 24)).toFixed(1)} d`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  await requireCoach();
  const now = new Date();
  const selected =
    RANGES.find((r) => String(r.days) === searchParams.days) ??
    (searchParams.days === "all" ? RANGES[RANGES.length - 1] : RANGES[0]);
  const window = windowFor(selected.days, now);

  const [metrics, economics, studio] = await Promise.all([
    funnelMetrics(window, now),
    sourceEconomics(window),
    studioMetrics(now),
  ]);

  const spendCents = economics.reduce((sum, row) => sum + row.spendCents, 0);
  const revenueCents = economics.reduce((sum, row) => sum + row.revenueCents, 0);

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Growth</h1>
          <p className="mt-1 text-slate-600">
            Every stage of the funnel, for leads that arrived in the selected period.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((range) => {
            const key = range.days === null ? "all" : String(range.days);
            const active = selected.days === range.days;
            return (
              <Link
                key={key}
                href={`/coach/growth?days=${key}`}
                className={
                  active
                    ? "btn btn-md bg-brand text-white shadow-card"
                    : "btn btn-secondary btn-md"
                }
              >
                {range.label}
              </Link>
            );
          })}
          <Link
            href="/coach/growth/spend"
            className="btn btn-secondary btn-md"
          >
            Ad spend
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow text-xs">Speed</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Leads" value={String(metrics.leads)} hint={`${metrics.firstContact.neverContacted} never contacted`} />
          <Stat
            label="Texted in 5 min"
            value={pct(metrics.firstContact.withinFiveMinutes)}
            hint={ofBase(metrics.firstContact.withinFiveMinutes)}
          />
          <Stat label="Median first contact" value={duration(metrics.firstContact.medianMinutes)} />
          <Stat label="Slowest 10%" value={duration(metrics.firstContact.p90Minutes)} hint="90th percentile" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow text-xs">Funnel</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Replied" value={pct(metrics.responseRate)} hint={ofBase(metrics.responseRate)} />
          <Stat label="Lead → trial" value={pct(metrics.leadToTrial)} hint={ofBase(metrics.leadToTrial)} />
          <Stat
            label="Trial → showed"
            value={pct(metrics.trialShowRate)}
            hint={
              metrics.trialsAwaitingAttendance > 0
                ? `${metrics.trialsAwaitingAttendance} unmarked`
                : ofBase(metrics.trialShowRate)
            }
          />
          <Stat label="Trial → member" value={pct(metrics.trialToMembership)} hint={ofBase(metrics.trialToMembership)} />
          <Stat label="Lead → member" value={pct(metrics.leadToMembership)} hint={ofBase(metrics.leadToMembership)} />
          <Stat
            label="Time to join"
            value={
              metrics.medianDaysToMembership === null
                ? "—"
                : `${metrics.medianDaysToMembership.toFixed(1)} d`
            }
            hint="median, lead → membership"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow text-xs">
          Agent vs. humans
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Conversations" value={String(metrics.agent.conversations)} hint="threads the agent wrote in" />
          <Stat label="Handed off" value={pct(metrics.agent.handoffRate)} hint={ofBase(metrics.agent.handoffRate)} />
          <Stat label="Agent → trial" value={pct(metrics.agent.bookedRate)} hint={ofBase(metrics.agent.bookedRate)} />
          <Stat
            label="Fully automated"
            value={pct(metrics.agent.fullyHandled)}
            hint="no staff text on the thread"
          />
          <Stat
            label="Drafts edited"
            value={pct(metrics.agent.draftsEditedBeforeSending)}
            hint={ofBase(metrics.agent.draftsEditedBeforeSending)}
          />
          <Stat
            label="Staff time / lead"
            value={duration(metrics.staffTime.medianMinutesPerLead)}
            hint={`${metrics.staffTime.totalMinutes} min over ${metrics.staffTime.leadsTouched} leads`}
          />
        </div>
        <p className="text-sm text-slate-500">
          While the agent runs in draft mode, &ldquo;fully automated&rdquo; stays at 0% by design —
          it is the number to watch before trusting autopilot, alongside how often drafts need
          editing.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow text-xs">
          Reactivation
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Old leads worked" value={String(metrics.reactivation.enrolled)} />
          <Stat label="Replied" value={pct(metrics.reactivation.replied)} hint={ofBase(metrics.reactivation.replied)} />
          <Stat label="Booked a trial" value={pct(metrics.reactivation.booked)} hint={ofBase(metrics.reactivation.booked)} />
          <Stat label="Became members" value={pct(metrics.reactivation.won)} hint={ofBase(metrics.reactivation.won)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow text-xs">Money</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Ad spend" value={formatPrice(spendCents)} hint="entered by hand" />
          <Stat
            label="Revenue from these leads"
            value={formatPrice(revenueCents)}
            hint="all-time, from members they became"
          />
          <Stat
            label="Return on spend"
            value={spendCents > 0 ? `${(revenueCents / spendCents).toFixed(1)}×` : "—"}
          />
          <Stat label="Average member LTV" value={formatPrice(studio.avgLtvCents)} hint="whole studio" />
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Cost and return by source and campaign</caption>
            <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Leads</th>
                <th className="px-4 py-3">Trials</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Spend</th>
                <th className="px-4 py-3">Per lead</th>
                <th className="px-4 py-3">Per member</th>
                <th className="px-4 py-3">Revenue</th>
                <th className="px-4 py-3">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {economics.map((row) => (
                <tr key={`${row.source}-${row.campaign ?? ""}`} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-medium">{row.source.toLowerCase().replace(/_/g, " ")}</span>
                    {row.campaign && <span className="text-slate-500"> · {row.campaign}</span>}
                  </td>
                  <td className="px-4 py-3">{row.leads}</td>
                  <td className="px-4 py-3">{row.trials}</td>
                  <td className="px-4 py-3">{row.members}</td>
                  <td className="px-4 py-3">{row.spendCents > 0 ? formatPrice(row.spendCents) : "—"}</td>
                  <td className="px-4 py-3">
                    {row.costPerLeadCents === null ? "—" : formatPrice(row.costPerLeadCents)}
                  </td>
                  <td className="px-4 py-3">
                    {row.costPerMemberCents === null ? "—" : formatPrice(row.costPerMemberCents)}
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatPrice(row.revenueCents)}</td>
                  <td className="px-4 py-3">{row.roas === null ? "—" : `${row.roas.toFixed(1)}×`}</td>
                </tr>
              ))}
              {economics.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-slate-600">
                    No leads in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-500">
          Cost per member is blank until spend is recorded for that source —{" "}
          <Link href="/coach/growth/spend" className="underline">
            add it here
          </Link>
          . Revenue counts every payment ever collected from members who came from these leads, so a
          period keeps earning after it closes.
        </p>
      </section>
    </div>
  );
}
