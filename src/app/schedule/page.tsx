import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, householdProfiles } from "@/lib/auth";
import { formatDay, formatTime, programColors } from "@/lib/format";
import BookingControls from "@/components/BookingControls";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { program?: string; age?: string; level?: string };
}) {
  const user = await requireUser();
  const profiles = householdProfiles(user);
  const isCoach = user.role === "COACH" || user.role === "ADMIN";

  const programs = await prisma.program.findMany({ orderBy: { name: "asc" } });
  const sessions = await prisma.classSession.findMany({
    where: {
      startsAt: { gte: new Date() },
      status: "SCHEDULED",
      template: {
        ...(searchParams.program ? { programId: searchParams.program } : {}),
        ...(searchParams.age ? { ageGroup: searchParams.age } : {}),
        ...(searchParams.level ? { level: searchParams.level } : {}),
      },
    },
    include: {
      template: { include: { program: true } },
      bookings: true,
    },
    orderBy: { startsAt: "asc" },
  });

  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = formatDay(s.startsAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = { ...searchParams, ...params };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return qs ? `/schedule?${qs}` : "/schedule";
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
      <p className="mt-1 text-stone-600">Find your next class and book in seconds.</p>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Program filters">
        <Link
          href={filterLink({ program: undefined })}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            !searchParams.program ? "bg-brand text-white" : "bg-white text-stone-700 border border-stone-300"
          }`}
        >
          All programs
        </Link>
        {programs.map((p) => (
          <Link
            key={p.id}
            href={filterLink({ program: p.id })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              searchParams.program === p.id
                ? "bg-brand text-white"
                : "bg-white text-stone-700 border border-stone-300"
            }`}
          >
            {p.name}
          </Link>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2" aria-label="Level and age filters">
        <Link
          href={filterLink({ level: searchParams.level === "BEGINNER" ? undefined : "BEGINNER" })}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            searchParams.level === "BEGINNER"
              ? "bg-brand text-white"
              : "bg-white text-stone-700 border border-stone-300"
          }`}
        >
          Beginner-friendly
        </Link>
        <Link
          href={filterLink({ age: searchParams.age === "KIDS" ? undefined : "KIDS" })}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            searchParams.age === "KIDS"
              ? "bg-brand text-white"
              : "bg-white text-stone-700 border border-stone-300"
          }`}
        >
          Kids
        </Link>
      </div>

      <div className="mt-6 space-y-8">
        {sessions.length === 0 && (
          <p className="rounded-lg border border-stone-200 bg-white p-6 text-stone-600">
            No upcoming classes match these filters. Try clearing a filter.
          </p>
        )}
        {Array.from(byDay.entries()).map(([day, daySessions]) => (
          <section key={day}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{day}</h2>
            <div className="mt-2 space-y-3">
              {daySessions.map((s) => {
                const booked = s.bookings.filter((b) => b.status === "BOOKED").length;
                const isFull = booked >= s.template.capacity;
                const spotsLeft = s.template.capacity - booked;
                const eligible = profiles.filter((p) =>
                  s.template.ageGroup === "KIDS"
                    ? p.isChild
                    : s.template.ageGroup === "ADULTS"
                      ? !p.isChild
                      : true
                );
                return (
                  <article key={s.id} className="rounded-xl border border-stone-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{s.template.name}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              programColors[s.template.program.color] ?? programColors.stone
                            }`}
                          >
                            {s.template.program.name}
                          </span>
                          {s.template.level === "BEGINNER" && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              Beginner-friendly
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-stone-600">
                          {formatTime(s.startsAt)} · {s.template.durationMin} min · {s.instructor}
                        </p>
                        <p className="mt-1 text-sm text-stone-600">{s.template.description}</p>
                        {s.template.gearNotes && (
                          <p className="mt-1 text-sm text-stone-500">Gear: {s.template.gearNotes}</p>
                        )}
                      </div>
                      <p
                        className={`shrink-0 text-sm font-medium ${
                          isFull ? "text-amber-700" : "text-stone-500"
                        }`}
                      >
                        {isFull ? "Class full" : `${spotsLeft} spots left`}
                      </p>
                    </div>
                    {!isCoach && eligible.length > 0 && (
                      <BookingControls
                        sessionId={s.id}
                        profiles={eligible.map((p) => ({
                          id: p.id,
                          name: p.name,
                          isChild: p.isChild,
                        }))}
                        bookings={s.bookings.map((b) => ({
                          profileId: b.profileId,
                          status: b.status,
                        }))}
                        isFull={isFull}
                        inPast={s.startsAt < new Date()}
                      />
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
