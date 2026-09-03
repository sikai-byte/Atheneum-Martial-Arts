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
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
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
          <h1 className="text-2xl font-bold tracking-tight">Growth</h1>
          <p className="mt-1 text-stone-600">
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
                    ? "rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white"
                    : "rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
                }
              >
                {range.label}
              </Link>
            );
          })}
          <Link
            href="/coach/growth/spend"
            className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
          >
            Ad spend
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Speed</h2>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Funnel</h2>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
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
        <p className="text-sm text-stone-500">
          While the agent runs in draft mode, &ldquo;fully automated&rdquo; stays at 0% by design —
          it is the number to watch before trusting autopilot, alongside how often drafts need
          editing.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Money</h2>
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

        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Cost and return by source and campaign</caption>
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
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
            <tbody className="divide-y divide-stone-100">
              {economics.map((row) => (
                <tr key={`${row.source}-${row.campaign ?? ""}`}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{row.source.toLowerCase().replace(/_/g, " ")}</span>
                    {row.campaign && <span className="text-stone-500"> · {row.campaign}</span>}
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
                  <td colSpan={9} className="px-4 py-4 text-stone-600">
                    No leads in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-stone-500">
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
