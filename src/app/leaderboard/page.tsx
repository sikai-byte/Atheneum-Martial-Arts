import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MEDALS = ["🥇", "🥈", "🥉"];

type Entry = {
  profileId: string;
  name: string;
  isChild: boolean;
  photoUrl: string | null;
  count: number;
};

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function parseMonth(raw: string | undefined): { year: number; month: number } {
  const now = new Date();
  const match = raw?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (month >= 0 && month <= 11) {
      const requested = new Date(year, month, 1);
      if (requested <= now) return { year, month };
    }
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

function monthParam(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

async function topAttendance(range?: { gte: Date; lt: Date }): Promise<Entry[]> {
  const grouped = await prisma.attendance.groupBy({
    by: ["profileId"],
    where: range ? { session: { startsAt: range } } : undefined,
    _count: { _all: true },
    orderBy: { _count: { profileId: "desc" } },
    take: 200,
  });
  if (grouped.length === 0) return [];

  const profiles = await prisma.memberProfile.findMany({
    where: { id: { in: grouped.map((g) => g.profileId) } },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return grouped.flatMap((g) => {
    const profile = byId.get(g.profileId);
    if (!profile) return [];
    return [
      {
        profileId: profile.id,
        name: profile.name,
        isChild: profile.isChild,
        photoUrl: profile.photoType
          ? `/api/profile-photo/${profile.id}?v=${profile.photoUpdatedAt?.getTime() ?? 0}`
          : null,
        count: g._count._all,
      },
    ];
  });
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Board({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <section aria-label={title}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h2>
      {entries.length === 0 ? (
        <p className="mt-2 rounded-xl border border-stone-200 bg-white p-4 text-stone-600">
          No check-ins yet — the first class attended starts the race.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {entries.map((e, i) => (
            <li
              key={e.profileId}
              className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${
                i === 0 ? "border-amber-300 bg-amber-50" : "border-stone-200"
              }`}
            >
              <span className="w-8 text-center text-lg font-bold text-stone-500">
                {MEDALS[i] ?? i + 1}
              </span>
              {e.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.photoUrl}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-600">
                  {initials(e.name)}
                </span>
              )}
              <span className="flex-1 font-medium">{e.name}</span>
              <span className="text-sm text-stone-600">
                <span className="text-lg font-bold text-stone-900">{e.count}</span>{" "}
                {e.count === 1 ? "class" : "classes"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: { view?: string; month?: string };
}) {
  await requireUser();

  const view = searchParams.view === "alltime" ? "alltime" : "monthly";
  const { year, month } = parseMonth(searchParams.month);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth();
  const prev = new Date(year, month - 1, 1);

  const entries =
    view === "alltime"
      ? await topAttendance()
      : await topAttendance({ gte: monthStart, lt: monthEnd });

  const adults = entries.filter((e) => !e.isChild).slice(0, 10);
  const kids = entries.filter((e) => e.isChild).slice(0, 10);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-stone-600">
          Our most consistent members — your only limit is your tribe.
        </p>
      </section>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Leaderboard view">
        <Link
          href="/leaderboard"
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            view === "monthly"
              ? "bg-brand text-white"
              : "border border-stone-300 bg-white text-stone-700"
          }`}
        >
          Monthly
        </Link>
        <Link
          href="/leaderboard?view=alltime"
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            view === "alltime"
              ? "bg-brand text-white"
              : "border border-stone-300 bg-white text-stone-700"
          }`}
        >
          All time
        </Link>
      </nav>

      {view === "monthly" && (
        <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2">
          <Link
            href={`/leaderboard?month=${monthParam(prev.getFullYear(), prev.getMonth())}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            aria-label="Previous month"
          >
            ← Prev
          </Link>
          <p className="font-semibold">{monthLabel(year, month)}</p>
          {isCurrentMonth ? (
            <span className="px-3 py-1.5 text-sm text-stone-300">Next →</span>
          ) : (
            <Link
              href={`/leaderboard?month=${monthParam(
                new Date(year, month + 1, 1).getFullYear(),
                new Date(year, month + 1, 1).getMonth()
              )}`}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
              aria-label="Next month"
            >
              Next →
            </Link>
          )}
        </div>
      )}

      <Board
        title={view === "alltime" ? "Adults — all time" : `Adults — ${monthLabel(year, month)}`}
        entries={adults}
      />
      <Board
        title={view === "alltime" ? "Kids — all time" : `Kids — ${monthLabel(year, month)}`}
        entries={kids}
      />
    </div>
  );
}
