import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCoach } from "@/lib/auth";
import { deleteAnnouncement, postAnnouncement } from "@/lib/actions";
import { formatDay, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CoachTodayPage() {
  const coach = await requireCoach();

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [todaySessions, upcomingSessions, announcements] = await Promise.all([
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
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const renderSession = (s: (typeof todaySessions)[number], showDay = false) => (
    <Link
      key={s.id}
      href={`/coach/session/${s.id}`}
      className="block card p-4 hover:border-slate-400"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{s.template.name}</p>
          <p className="mt-1 text-sm text-slate-600">
            {showDay && `${formatDay(s.startsAt)} · `}
            {formatTime(s.startsAt)} · {s.instructor}
          </p>
        </div>
        <div className="text-right text-sm text-slate-600">
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
        <h1 className="page-title">Today</h1>
        <p className="mt-1 text-slate-600">Welcome, {coach.name}. Tap a class to manage its roster.</p>
      </section>

      <section aria-labelledby="today-classes">
        <h2 id="today-classes" className="eyebrow text-xs">
          Today&apos;s classes
        </h2>
        {todaySessions.length === 0 ? (
          <p className="mt-2 card p-4 text-slate-600">
            No classes scheduled today.
          </p>
        ) : (
          <div className="mt-2 space-y-3">{todaySessions.map((s) => renderSession(s))}</div>
        )}
      </section>

      <section aria-labelledby="upcoming-classes">
        <h2 id="upcoming-classes" className="eyebrow text-xs">
          Upcoming
        </h2>
        <div className="mt-2 space-y-3">{upcomingSessions.map((s) => renderSession(s, true))}</div>
      </section>

      <section aria-labelledby="post-update">
        <h2 id="post-update" className="eyebrow text-xs">
          Post an update
        </h2>
        <form action={postAnnouncement} className="mt-2 space-y-3 card p-4">
          <p className="text-sm text-slate-600">
            Updates appear on every member&apos;s home page right away.
          </p>
          <div>
            <label htmlFor="announcement-title" className="mb-1 block text-sm font-medium">
              Title
            </label>
            <input
              id="announcement-title"
              name="title"
              required
              maxLength={120}
              placeholder="e.g. No gi classes this Friday"
              className="field-input py-2.5"
            />
          </div>
          <div>
            <label htmlFor="announcement-body" className="mb-1 block text-sm font-medium">
              Message
            </label>
            <textarea
              id="announcement-body"
              name="body"
              required
              rows={3}
              maxLength={2000}
              placeholder="What do members need to know?"
              className="field-input py-2.5"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Post to all members
          </button>
        </form>
        {announcements.length > 0 && (
          <div className="mt-3 space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{a.body}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {a.author} · {formatDay(a.createdAt)}
                    </p>
                  </div>
                  <form action={deleteAnnouncement.bind(null, a.id)}>
                    <button
                      type="submit"
                      className="btn btn-secondary px-2.5 py-1.5 text-xs"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
