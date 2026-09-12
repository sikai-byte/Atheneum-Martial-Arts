import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { coachInitials as initials } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CoachesPage() {
  await requireUser();

  const coaches = await prisma.coachProfile.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const mainCoaches = coaches.filter((c) => c.role === "MAIN");
  const assistantCoaches = coaches.filter((c) => c.role === "ASSISTANT");

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Our Coaches</h1>
        <p className="mt-1 text-stone-600">
          The team behind every class at Atheneum Martial Arts.
        </p>
      </section>

      <section aria-label="Main coaches" className="space-y-4">
        {mainCoaches.map((coach) => (
          <article
            key={coach.id}
            className="flex flex-col items-center gap-4 rounded-xl border border-stone-200 bg-white p-5 text-center shadow-sm sm:flex-row sm:items-start sm:text-left sm:p-6"
          >
            {coach.photoType ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/coach-photo/${coach.id}?v=${coach.photoUpdatedAt?.getTime() ?? 0}`}
                alt={coach.name}
                className="h-28 w-28 shrink-0 rounded-full object-cover ring-2 ring-stone-100 sm:h-32 sm:w-32"
              />
            ) : (
              <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-brand/10 text-3xl font-bold text-brand sm:h-32 sm:w-32">
                {initials(coach.name)}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">{coach.name}</h2>
              {coach.disciplines && (
                <ul className="mt-1.5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                  {coach.disciplines.split(",").map((d) => (
                    <li
                      key={d}
                      className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600"
                    >
                      {d}
                    </li>
                  ))}
                </ul>
              )}
              {coach.bio && <p className="mt-2 text-sm text-stone-600">{coach.bio}</p>}
            </div>
          </article>
        ))}
      </section>

      {assistantCoaches.length > 0 && (
        <section aria-label="Assistant coaches">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Assistant Coaches
          </h2>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {assistantCoaches.map((coach) => (
              <li
                key={coach.id}
                className="flex flex-col items-center gap-2 rounded-xl border border-stone-200 bg-white p-5 text-center shadow-sm"
              >
                {coach.photoType ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/coach-photo/${coach.id}?v=${coach.photoUpdatedAt?.getTime() ?? 0}`}
                    alt={coach.name}
                    className="h-20 w-20 rounded-full object-cover ring-2 ring-stone-100"
                  />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/10 text-xl font-bold text-brand">
                    {initials(coach.name)}
                  </span>
                )}
                <span className="text-sm font-medium">{coach.name}</span>
                <span className="text-xs text-stone-500">Assistant Coach</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
