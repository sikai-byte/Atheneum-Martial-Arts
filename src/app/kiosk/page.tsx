import Link from "next/link";
import { prisma } from "@/lib/db";
import { isKioskEnabled } from "@/lib/kiosk";
import { formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const enabled = await isKioskEnabled();

  if (!enabled) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Front-desk kiosk</h1>
        <p className="text-stone-600">
          This device isn&apos;t set up as a kiosk yet. An admin can sign in and turn on kiosk mode
          from <span className="font-medium">Admin &rarr; Front-desk kiosk</span>.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Admin sign in
        </Link>
      </div>
    );
  }

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const sessions = await prisma.classSession.findMany({
    where: { startsAt: { gte: dayStart, lt: dayEnd }, status: "SCHEDULED" },
    include: {
      template: { include: { program: true } },
      bookings: { where: { status: "BOOKED" } },
      attendances: true,
    },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="space-y-8 py-4">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to Atheneum</h1>
        <p className="mt-2 text-lg text-stone-600">Tap your class to check in.</p>
      </section>

      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-lg text-stone-600 shadow-sm">
          No classes scheduled today.
        </p>
      ) : (
        <div className="space-y-4">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/kiosk/${s.id}`}
              className="block rounded-2xl border border-stone-200 bg-white p-6 shadow-sm active:bg-stone-50"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-xl font-semibold">{s.template.name}</p>
                  <p className="mt-1 text-lg text-stone-600">
                    {formatTime(s.startsAt)} · {s.instructor}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold text-emerald-700">
                    {s.attendances.length} checked in
                  </p>
                  <p className="text-stone-500">{s.bookings.length} booked</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
        <p className="text-lg font-medium">First time here?</p>
        <p className="mt-1 text-stone-600">Register and sign the waiver in under a minute.</p>
        <Link
          href="/register"
          className="mt-3 inline-block rounded-xl bg-brand px-6 py-3.5 text-lg font-semibold text-white hover:bg-brand-dark"
        >
          Register as a new member
        </Link>
      </section>
    </div>
  );
}
