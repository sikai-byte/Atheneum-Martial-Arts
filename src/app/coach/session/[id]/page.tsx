import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCoach } from "@/lib/auth";
import { toggleAttendance } from "@/lib/actions";
import { formatDay, formatTime } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function RosterPage({ params }: { params: { id: string } }) {
  await requireCoach();

  const session = await prisma.classSession.findUnique({
    where: { id: params.id },
    include: {
      template: { include: { program: true } },
      bookings: {
        where: { status: { in: ["BOOKED", "WAITLISTED"] } },
        include: { profile: true },
        orderBy: { createdAt: "asc" },
      },
      attendances: { include: { profile: true } },
    },
  });
  if (!session) notFound();

  const attendedIds = new Set(session.attendances.map((a) => a.profileId));
  const booked = session.bookings.filter((b) => b.status === "BOOKED");
  const waitlisted = session.bookings.filter((b) => b.status === "WAITLISTED");
  const walkIns = session.attendances.filter(
    (a) => !session.bookings.some((b) => b.profileId === a.profileId)
  );

  return (
    <div className="space-y-6">
      <Link href="/coach" className="text-sm text-stone-500 hover:text-stone-800">
        &larr; Back to Today
      </Link>

      <section>
        <h1 className="text-2xl font-bold tracking-tight">{session.template.name}</h1>
        <p className="mt-1 text-stone-600">
          {formatDay(session.startsAt)} at {formatTime(session.startsAt)} · {session.instructor}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          {booked.length}/{session.template.capacity} booked · {session.attendances.length} checked in
        </p>
      </section>

      <section aria-labelledby="roster">
        <h2 id="roster" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Roster
        </h2>
        {booked.length === 0 ? (
          <p className="mt-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-stone-600">
            No bookings yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {booked.map((b) => {
              const attended = attendedIds.has(b.profileId);
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="font-medium">{b.profile.name}</p>
                    <p className="text-sm text-stone-500">
                      {b.profile.isChild ? "Youth member" : "Adult member"} ·{" "}
                      {attended ? "Checked in" : "Not checked in"}
                    </p>
                  </div>
                  <form action={toggleAttendance.bind(null, b.profileId, session.id)}>
                    <SubmitButton
                      pendingLabel={attended ? "Undoing…" : "Checking in…"}
                      className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${
                        attended
                          ? "border border-stone-300 text-stone-700 hover:bg-stone-100"
                          : "bg-emerald-700 text-white hover:bg-emerald-800"
                      }`}
                    >
                      {attended ? "Undo check-in" : "Check in"}
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {waitlisted.length > 0 && (
        <section aria-labelledby="waitlist">
          <h2 id="waitlist" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Waitlist
          </h2>
          <ul className="mt-2 space-y-2">
            {waitlisted.map((b) => (
              <li key={b.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <p className="font-medium">{b.profile.name}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {walkIns.length > 0 && (
        <section aria-labelledby="walkins">
          <h2 id="walkins" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Checked in without booking
          </h2>
          <ul className="mt-2 space-y-2">
            {walkIns.map((a) => (
              <li key={a.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <p className="font-medium">{a.profile.name}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
