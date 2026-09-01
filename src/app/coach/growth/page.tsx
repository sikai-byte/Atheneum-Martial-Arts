import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { memberValues, sourceRollups, studioMetrics } from "@/lib/members/ltv";

export const dynamic = "force-dynamic";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function GrowthPage() {
  await requireCoach();
  const now = new Date();
  const [rollups, metrics, values] = await Promise.all([
    sourceRollups(),
    studioMetrics(now),
    memberValues(now),
  ]);

  const totals = rollups.reduce(
    (acc, r) => ({
      leads: acc.leads + r.leads,
      members: acc.members + r.members,
      revenueCents: acc.revenueCents + r.revenueCents,
    }),
    { leads: 0, members: 0, revenueCents: 0 },
  );
  const untracked = values.filter((v) => !v.source);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Growth</h1>
          <p className="mt-1 text-stone-600">
            What each lead source actually produced — members and revenue, not just cheap leads.
          </p>
        </div>
        <Link
          href="/coach/members"
          className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          Members
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Leads tracked", value: String(totals.leads) },
          {
            label: "Lead → member",
            value: totals.leads > 0 ? percent(totals.members / totals.leads) : "—",
            hint: `${totals.members} members from leads`,
          },
          { label: "Revenue from leads", value: formatPrice(totals.revenueCents) },
          { label: "Average member LTV", value: formatPrice(metrics.avgLtvCents) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold">{stat.value}</p>
            {stat.hint && <p className="text-xs text-stone-500">{stat.hint}</p>}
          </div>
        ))}
      </section>

      <section className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">Leads, members and revenue by source and campaign</caption>
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Leads</th>
              <th className="px-4 py-3">Texted</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Conversion</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">Avg LTV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rollups.map((row) => (
              <tr key={`${row.source}-${row.campaign ?? ""}`}>
                <td className="px-4 py-3">
                  <span className="font-medium">{row.source.toLowerCase().replace("_", " ")}</span>
                  {row.campaign && <span className="text-stone-500"> · {row.campaign}</span>}
                </td>
                <td className="px-4 py-3">{row.leads}</td>
                <td className="px-4 py-3">{row.contacted}</td>
                <td className="px-4 py-3">{row.members}</td>
                <td className="px-4 py-3">{row.activeMembers}</td>
                <td className="px-4 py-3">{percent(row.conversionRate)}</td>
                <td className="px-4 py-3 font-semibold">{formatPrice(row.revenueCents)}</td>
                <td className="px-4 py-3">{formatPrice(row.avgLtvCents)}</td>
              </tr>
            ))}
            {rollups.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-stone-600">
                  No leads captured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-sm text-stone-500">
        Revenue counts payments recorded against members who came from a tracked lead.
        {untracked.length > 0 &&
          ` ${untracked.length} member${untracked.length === 1 ? "" : "s"} predate lead tracking, so their revenue isn't attributed to a source.`}
      </p>
    </div>
  );
}
