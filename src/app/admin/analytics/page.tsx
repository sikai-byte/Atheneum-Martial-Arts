import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatDay, startOfWeek } from "@/lib/format";
import {
  MESSAGE_SAVING_TYPES,
  MINUTES_SAVED,
  TIME_SAVED_LABELS,
  type TelemetryType,
} from "@/lib/telemetry";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_SHOWN = 8;

function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY_MS);
}

function pct(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export default async function AnalyticsPage() {
  await requireAdmin();

  const now = new Date();
  const weekStarts: Date[] = [];
  for (let i = WEEKS_SHOWN - 1; i >= 0; i--) {
    weekStarts.push(startOfWeek(new Date(now.getTime() - i * 7 * DAY_MS)));
  }

  const [
    loginEvents,
    eventCountsAllTime,
    eventCounts30d,
    firstEvent,
    profiles,
    attendance90d,
    lastAttendanceByProfile,
    bookings30d,
    pastBookings30d,
    pastAttendance30d,
    trialProfiles,
  ] = await Promise.all([
    prisma.telemetryEvent.findMany({
      where: { type: "LOGIN", createdAt: { gte: weekStarts[0] } },
      select: { userId: true, createdAt: true },
    }),
    prisma.telemetryEvent.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.telemetryEvent.groupBy({
      by: ["type"],
      _count: { _all: true },
      where: { createdAt: { gte: daysAgo(30) } },
    }),
    prisma.telemetryEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.memberProfile.findMany({
      where: {
        OR: [{ user: null }, { user: { role: { in: ["MEMBER", "PARENT"] } } }],
      },
      select: { id: true, name: true, isChild: true, membershipType: true },
    }),
    prisma.attendance.findMany({
      where: { checkedInAt: { gte: daysAgo(60) } },
      select: { profileId: true, checkedInAt: true },
    }),
    prisma.attendance.groupBy({ by: ["profileId"], _max: { checkedInAt: true } }),
    prisma.booking.findMany({
      where: { createdAt: { gte: daysAgo(30) } },
      select: { profileId: true, status: true },
    }),
    prisma.booking.findMany({
      where: {
        status: "BOOKED",
        session: { startsAt: { gte: daysAgo(30), lt: now }, status: "SCHEDULED" },
      },
      select: { profileId: true, sessionId: true },
    }),
    prisma.attendance.findMany({
      where: { session: { startsAt: { gte: daysAgo(30), lt: now } } },
      select: { profileId: true, sessionId: true },
    }),
    prisma.memberProfile.findMany({
      where: { trialStartedAt: { not: null } },
      select: {
        id: true,
        name: true,
        isChild: true,
        membershipType: true,
        membershipPlan: true,
        membershipRenewsAt: true,
        trialStartedAt: true,
        trialConvertedAt: true,
      },
      orderBy: { trialStartedAt: "desc" },
    }),
  ]);

  const memberProfileIds = new Set(profiles.map((p) => p.id));

  // --- Weekly active members (distinct logins per week) ---
  const weeklyActive = weekStarts.map((start) => {
    const end = new Date(start.getTime() + 7 * DAY_MS);
    const ids = new Set(
      loginEvents
        .filter((e) => e.createdAt >= start && e.createdAt < end && e.userId)
        .map((e) => e.userId)
    );
    return { start, count: ids.size };
  });
  const maxWeekly = Math.max(...weeklyActive.map((w) => w.count), 1);

  // --- Booking adoption (last 30 days) ---
  const bookersLast30 = new Set(
    bookings30d.filter((b) => memberProfileIds.has(b.profileId)).map((b) => b.profileId)
  );
  const counts30 = Object.fromEntries(
    eventCounts30d.map((e) => [e.type, e._count._all])
  ) as Partial<Record<TelemetryType, number>>;
  const selfBookings30 = counts30.SELF_BOOKING ?? 0;
  const adminBookings30 = counts30.ADMIN_BOOKING ?? 0;

  // --- Attendance frequency (last 30 days) ---
  const attendance30d = attendance90d.filter((a) => a.checkedInAt >= daysAgo(30));
  const attendees30 = new Set(attendance30d.map((a) => a.profileId));
  const avgPerWeek =
    attendees30.size > 0
      ? (attendance30d.length / attendees30.size / (30 / 7)).toFixed(1)
      : "—";

  // --- Cancellations & no-shows (last 30 days) ---
  const cancellations30 = (counts30.SELF_CANCELLATION ?? 0) + (counts30.ADMIN_CANCELLATION ?? 0);
  const attendedKeys = new Set(pastAttendance30d.map((a) => `${a.profileId}|${a.sessionId}`));
  const noShows30 = pastBookings30d.filter(
    (b) => !attendedKeys.has(`${b.profileId}|${b.sessionId}`)
  ).length;

  // --- Retention / churn (attended 31–60 days ago vs. last 30 days) ---
  const priorWindow = new Set(
    attendance90d.filter((a) => a.checkedInAt < daysAgo(30)).map((a) => a.profileId)
  );
  const retained = Array.from(priorWindow).filter((id) => attendees30.has(id)).length;

  // --- Absence lists ---
  const lastByProfile = new Map(
    lastAttendanceByProfile.map((a) => [a.profileId, a._max.checkedInAt as Date])
  );
  const absent = profiles
    .filter((p) => lastByProfile.has(p.id))
    .map((p) => ({
      ...p,
      days: Math.floor((now.getTime() - lastByProfile.get(p.id)!.getTime()) / DAY_MS),
    }))
    .filter((p) => p.days >= 7)
    .sort((a, b) => b.days - a.days);
  const buckets = [
    { label: "Absent 30+ days", items: absent.filter((p) => p.days >= 30) },
    { label: "Absent 14–29 days", items: absent.filter((p) => p.days >= 14 && p.days < 30) },
    { label: "Absent 7–13 days", items: absent.filter((p) => p.days >= 7 && p.days < 14) },
  ];
  const neverAttended = profiles.filter((p) => !lastByProfile.has(p.id)).length;

  // --- Trial conversion (revenue attribution precursor) ---
  const conversions = trialProfiles.filter((p) => p.trialConvertedAt);
  const activeTrials = trialProfiles.filter(
    (p) =>
      p.membershipType === "TRIAL" &&
      (!p.membershipRenewsAt || p.membershipRenewsAt.getTime() >= now.getTime())
  );
  const lapsedTrials = trialProfiles.filter(
    (p) =>
      !p.trialConvertedAt &&
      p.membershipType === "TRIAL" &&
      p.membershipRenewsAt &&
      p.membershipRenewsAt.getTime() < now.getTime()
  );
  const decidedTrials = conversions.length + lapsedTrials.length;
  const avgDaysToConvert =
    conversions.length > 0
      ? (
          conversions.reduce(
            (n, p) =>
              n + (p.trialConvertedAt!.getTime() - p.trialStartedAt!.getTime()) / DAY_MS,
            0
          ) / conversions.length
        ).toFixed(1)
      : "—";
  const recentConversions = [...conversions]
    .sort((a, b) => b.trialConvertedAt!.getTime() - a.trialConvertedAt!.getTime())
    .slice(0, 10);

  // --- Admin time & manual messages eliminated (all-time since tracking began) ---
  const countsAll = Object.fromEntries(
    eventCountsAllTime.map((e) => [e.type, e._count._all])
  ) as Partial<Record<TelemetryType, number>>;
  const savedRows = (Object.keys(TIME_SAVED_LABELS) as TelemetryType[]).map((type) => ({
    type,
    label: TIME_SAVED_LABELS[type]!,
    count: countsAll[type] ?? 0,
    minutes: (countsAll[type] ?? 0) * MINUTES_SAVED[type],
  }));
  const totalMinutesSaved = savedRows.reduce((n, r) => n + r.minutes, 0);
  const messagesEliminated = MESSAGE_SAVING_TYPES.reduce(
    (n, type) => n + (countsAll[type] ?? 0),
    0
  );

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <Link href="/admin" className="text-sm font-medium text-brand hover:underline">
            &larr; Back to Admin
          </Link>
        </div>
        <p className="mt-1 text-stone-600">
          Portal health at a glance: activity, bookings, attendance, retention, and the staff time
          the portal saves.
          {firstEvent && (
            <span className="text-stone-400">
              {" "}
              Event tracking began {formatDay(firstEvent.createdAt)}.
            </span>
          )}
        </p>
      </section>

      <section aria-labelledby="key-stats">
        <h2 id="key-stats" className="sr-only">
          Key stats
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "Active members this week",
              value: weeklyActive[weeklyActive.length - 1].count,
            },
            {
              label: "Booked a class (30 days)",
              value: `${bookersLast30.size} of ${profiles.length}`,
            },
            { label: "Avg classes / attendee / week", value: avgPerWeek },
            {
              label: "30-day retention",
              value: pct(retained, priorWindow.size),
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="text-2xl font-bold text-brand">{s.value}</p>
              <p className="mt-1 text-xs text-stone-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="wam">
        <h2 id="wam" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Weekly active members
        </h2>
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-600">
            Distinct people who signed in each week (last {WEEKS_SHOWN} weeks).
          </p>
          <ul className="mt-3 space-y-1.5">
            {weeklyActive.map((w) => (
              <li key={w.start.toISOString()} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-xs text-stone-500">
                  Wk of {w.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span
                  className="h-4 rounded bg-brand/70"
                  style={{ width: `${Math.max((w.count / maxWeekly) * 100, 2)}%` }}
                  aria-hidden
                />
                <span className="font-medium">{w.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="bookings">
        <h2 id="bookings" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Booking adoption (last 30 days)
        </h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Members who booked",
              value: `${pct(bookersLast30.size, profiles.length)} (${bookersLast30.size} of ${profiles.length})`,
            },
            { label: "Self-serve bookings", value: selfBookings30 },
            { label: "Front-desk (admin) bookings", value: adminBookings30 },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="text-xl font-bold text-brand">{s.value}</p>
              <p className="mt-1 text-xs text-stone-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="attendance-cancels">
        <h2
          id="attendance-cancels"
          className="text-sm font-semibold uppercase tracking-wide text-stone-500"
        >
          Attendance, cancellations &amp; no-shows (last 30 days)
        </h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Check-ins", value: attendance30d.length },
            { label: "Members who attended", value: attendees30.size },
            { label: "Cancellations", value: cancellations30 },
            { label: "No-shows (booked, not checked in)", value: noShows30 },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="text-xl font-bold text-brand">{s.value}</p>
              <p className="mt-1 text-xs text-stone-500">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-400">
          No-shows count past scheduled classes where a booking stayed active but no coach check-in
          was recorded.
        </p>
      </section>

      <section aria-labelledby="retention">
        <h2 id="retention" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Retention &amp; churn
        </h2>
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-sm">
          <p>
            Of the <strong>{priorWindow.size}</strong> members who trained 31–60 days ago,{" "}
            <strong>{retained}</strong> also trained in the last 30 days —{" "}
            <strong>{pct(retained, priorWindow.size)}</strong> retention (
            {pct(priorWindow.size - retained, priorWindow.size)} churn).
          </p>
        </div>
      </section>

      <section aria-labelledby="absent">
        <h2 id="absent" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Members going quiet
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Ranked by days since their last check-in — the outreach list for coaches.
          {neverAttended > 0 && ` ${neverAttended} member(s) have no check-ins yet.`}
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {buckets.map((bucket) => (
            <div
              key={bucket.label}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm font-semibold">
                {bucket.label}{" "}
                <span className="font-normal text-stone-400">({bucket.items.length})</span>
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {bucket.items.length === 0 && <li className="text-stone-400">No one — nice.</li>}
                {bucket.items.slice(0, 15).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/admin/member/${p.id}`}
                      className="truncate font-medium text-brand hover:underline"
                    >
                      {p.name}
                      {p.isChild && <span className="ml-1 text-xs text-stone-400">(child)</span>}
                    </Link>
                    <span className="shrink-0 text-xs text-stone-500">{p.days}d</span>
                  </li>
                ))}
                {bucket.items.length > 15 && (
                  <li className="text-xs text-stone-400">+ {bucket.items.length - 15} more</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="trial-conversion">
        <h2
          id="trial-conversion"
          className="text-sm font-semibold uppercase tracking-wide text-stone-500"
        >
          Trial conversion
        </h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Trials started (since tracking began)", value: trialProfiles.length },
            { label: "Converted to members", value: conversions.length },
            {
              label: "Conversion rate (of decided trials)",
              value: pct(conversions.length, decidedTrials),
            },
            { label: "Avg days to convert", value: avgDaysToConvert },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="text-xl font-bold text-brand">{s.value}</p>
              <p className="mt-1 text-xs text-stone-500">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold">
              Recent conversions{" "}
              <span className="font-normal text-stone-400">({conversions.length})</span>
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {recentConversions.length === 0 && (
                <li className="text-stone-400">No conversions recorded yet.</li>
              )}
              {recentConversions.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/member/${p.id}`}
                    className="truncate font-medium text-brand hover:underline"
                  >
                    {p.name}
                    {p.isChild && <span className="ml-1 text-xs text-stone-400">(child)</span>}
                  </Link>
                  <span className="shrink-0 text-xs text-stone-500">
                    {p.membershipPlan ?? p.membershipType}
                    {" \u00b7 "}
                    {formatDay(p.trialConvertedAt!)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold">
              Trials in flight{" "}
              <span className="font-normal text-stone-400">({activeTrials.length})</span>
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {activeTrials.length === 0 && <li className="text-stone-400">No active trials.</li>}
              {activeTrials.slice(0, 10).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/member/${p.id}`}
                    className="truncate font-medium text-brand hover:underline"
                  >
                    {p.name}
                    {p.isChild && <span className="ml-1 text-xs text-stone-400">(child)</span>}
                  </Link>
                  <span className="shrink-0 text-xs text-stone-500">
                    {p.membershipRenewsAt ? `ends ${formatDay(p.membershipRenewsAt)}` : "no end date"}
                  </span>
                </li>
              ))}
              {activeTrials.length > 10 && (
                <li className="text-xs text-stone-400">+ {activeTrials.length - 10} more</li>
              )}
            </ul>
            {lapsedTrials.length > 0 && (
              <p className="mt-3 text-xs text-stone-400">
                {lapsedTrials.length} expired trial(s) haven&apos;t converted — worth a follow-up.
              </p>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-stone-400">
          Conversion rate counts only trials that reached a decision (converted or expired) —
          trials still in flight aren&apos;t held against it.
        </p>
      </section>

      <section aria-labelledby="time-saved">
        <h2 id="time-saved" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Staff effort eliminated (since tracking began)
        </h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-brand">
              {(totalMinutesSaved / 60).toFixed(1)} hours
            </p>
            <p className="mt-1 text-xs text-stone-500">Estimated admin time saved</p>
            <ul className="mt-3 space-y-1 text-sm text-stone-600">
              {savedRows.map((r) => (
                <li key={r.type} className="flex items-center justify-between gap-2">
                  <span>
                    {r.label}{" "}
                    <span className="text-xs text-stone-400">
                      ({MINUTES_SAVED[r.type]} min each)
                    </span>
                  </span>
                  <span className="font-medium">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-brand">{messagesEliminated}</p>
            <p className="mt-1 text-xs text-stone-500">Manual messages eliminated</p>
            <p className="mt-3 text-sm text-stone-600">
              Automated emails (trial welcome, booking confirmations, password resets) plus
              automatic waitlist promotions that would otherwise have needed a text or call from
              the front desk.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
