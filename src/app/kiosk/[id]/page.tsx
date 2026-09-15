import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isKioskEnabled } from "@/lib/kiosk";
import { formatTime } from "@/lib/format";
import { classEligibilityError } from "@/lib/eligibility";
import KioskCheckIn, { KioskRosterEntry, KioskWalkInCandidate } from "@/components/KioskCheckIn";

export const dynamic = "force-dynamic";

export default async function KioskClassPage({ params }: { params: { id: string } }) {
  if (!(await isKioskEnabled())) redirect("/kiosk");

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const session = await prisma.classSession.findUnique({
    where: { id: params.id },
    include: {
      template: true,
      bookings: {
        where: { status: "BOOKED" },
        include: { profile: { select: { id: true, name: true } } },
      },
      attendances: { include: { profile: { select: { id: true, name: true } } } },
    },
  });
  if (!session || session.startsAt < dayStart || session.startsAt >= dayEnd) notFound();

  const attendedIds = new Set(session.attendances.map((a) => a.profileId));
  const entries = new Map<string, KioskRosterEntry>();
  for (const b of session.bookings) {
    entries.set(b.profileId, {
      profileId: b.profileId,
      displayName: b.profile.name,
      checkedIn: attendedIds.has(b.profileId),
    });
  }
  for (const a of session.attendances) {
    entries.set(a.profileId, {
      profileId: a.profileId,
      displayName: a.profile.name,
      checkedIn: true,
    });
  }
  const roster = Array.from(entries.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  const checkedInCount = roster.filter((r) => r.checkedIn).length;

  const candidates = await prisma.memberProfile.findMany({
    where: { id: { notIn: Array.from(entries.keys()) }, deactivatedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isChild: true,
      membershipType: true,
      user: { select: { role: true } },
    },
  });
  const walkInCandidates: KioskWalkInCandidate[] = candidates
    .filter((c) => classEligibilityError(c, session.template) === null)
    .map((c) => ({ profileId: c.id, displayName: c.name }));

  return (
    <div className="space-y-6 py-4">
      <Link href="/kiosk" className="text-lg text-stone-500 active:text-stone-800">
        &larr; All classes
      </Link>

      <section>
        <h1 className="text-3xl font-bold tracking-tight">{session.template.name}</h1>
        <p className="mt-1 text-lg text-stone-600">
          {formatTime(session.startsAt)} · {session.instructor} · {checkedInCount} checked in
        </p>
      </section>

      <KioskCheckIn sessionId={session.id} roster={roster} walkInCandidates={walkInCandidates} />
    </div>
  );
}
