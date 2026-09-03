import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, householdProfiles } from "@/lib/auth";
import { formatDay, formatTime, startOfWeek } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: { profile?: string };
}) {
  const user = await requireUser();
  const profiles = householdProfiles(user);
  const selected =
    profiles.find((p) => p.id === searchParams.profile) ??
    profiles.find((p) => !p.isChild) ??
    profiles[0];

  const [attendances, milestones] = await Promise.all([
    prisma.attendance.findMany({
      where: { profileId: selected.id },
      include: { session: { include: { template: { include: { program: true } } } } },
      orderBy: { session: { startsAt: "desc" } },
      take: 20,
    }),
    prisma.milestone.findMany({
      where: { profileId: selected.id },
      orderBy: { awardedAt: "desc" },
    }),
  ]);

  const weekStart = startOfWeek(new Date());
  const thisWeek = attendances.filter((a) => a.session.startsAt >= weekStart).length;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="page-title">Progress</h1>
        <p className="mt-1 text-slate-600">
          Consistency builds skill. Here&apos;s how training is going.
        </p>
      </section>

      {profiles.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Choose family member">
          {profiles.map((p) => (
            <Link
              key={p.id}
              href={`/progress?profile=${p.id}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                p.id === selected.id
                  ? "bg-brand text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      <section className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-3xl font-bold">{thisWeek}</p>
          <p className="mt-1 text-sm text-slate-600">
            classes this week (goal: {selected.weeklyGoal})
          </p>
        </div>
        <div className="card p-4">
          <p className="text-3xl font-bold">{attendances.length}</p>
          <p className="mt-1 text-sm text-slate-600">recent classes attended</p>
        </div>
      </section>

      {milestones.length > 0 && (
        <section aria-labelledby="milestones">
          <h2 id="milestones" className="eyebrow text-xs">
            Milestones
          </h2>
          <div className="mt-2 space-y-3">
            {milestones.map((m) => (
              <div key={m.id} className="card p-4">
                <p className="font-medium">{m.title}</p>
                {m.notes && <p className="mt-1 text-sm text-slate-600">{m.notes}</p>}
                <p className="mt-2 text-xs text-slate-400">
                  {m.awardedBy} · {formatDay(m.awardedAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="history">
        <h2 id="history" className="eyebrow text-xs">
          Recent training
        </h2>
        {attendances.length === 0 ? (
          <p className="mt-2 card p-4 text-slate-600">
            No classes recorded yet. Your first session will show up here.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {attendances.map((a) => (
              <li key={a.id} className="card p-4">
                <p className="font-medium">{a.session.template.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDay(a.session.startsAt)} at {formatTime(a.session.startsAt)} ·{" "}
                  {a.session.instructor}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
