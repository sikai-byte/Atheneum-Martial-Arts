import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCoach } from "@/lib/auth";
import { formatDay, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CoachTodayPage() {
  const coach = await requireCoach();

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [todaySessions, upcomingSessions] = await Promise.all([
    prisma.classSession.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd } },
      include: {
        template: { include: { program: true } },
        bookings: { where: { status: { in: ["BOOKED", "WAITLISTED"] } } },
        attendances: true,
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.classSession.findMany({
      where: { startsAt: { gte: dayEnd } },
      include: {
        template: { include: { program: true } },
        bookings: { where: { status: { in: ["BOOKED", "WAITLISTED"] } } },
        attendances: true,
      },
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
  ]);

  const renderSession = (s: (typeof todaySessions)[number], showDay = false) => (
    <Link
      key={s.id}
      href={`/coach/session/${s.id}`}
      className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-stone-400"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{s.template.name}</p>
          <p className="mt-1 text-sm text-stone-600">
            {showDay && `${formatDay(s.startsAt)} · `}
            {formatTime(s.startsAt)} · {s.instructor}
          </p>
        </div>
        <div className="text-right text-sm text-stone-600">
          <p>
            {s.bookings.filter((b) => b.status === "BOOKED").length}/{s.template.capacity} booked
          </p>
          <p>{s.attendances.length} checked in</p>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <p className="mt-1 text-stone-600">Welcome, {coach.name}. Tap a class to manage its roster.</p>
      </section>

      <section aria-labelledby="today-classes">
        <h2 id="today-classes" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Today&apos;s classes
        </h2>
        {todaySessions.length === 0 ? (
          <p className="mt-2 rounded-xl border border-stone-200 bg-white p-4 text-stone-600">
            No classes scheduled today.
          </p>
        ) : (
          <div className="mt-2 space-y-3">{todaySessions.map((s) => renderSession(s))}</div>
        )}
      </section>

      <section aria-labelledby="upcoming-classes">
        <h2 id="upcoming-classes" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Upcoming
        </h2>
        <div className="mt-2 space-y-3">{upcomingSessions.map((s) => renderSession(s, true))}</div>
      </section>
    </div>
  );
}
