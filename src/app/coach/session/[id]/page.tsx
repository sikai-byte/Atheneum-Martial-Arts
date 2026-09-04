import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCoach } from "@/lib/auth";
import {
  coachAddToRoster,
  coachRemoveFromRoster,
  coachWalkInCheckIn,
  toggleAttendance,
} from "@/lib/actions";
import { formatDay, formatTime } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function CheckInButton({ attended }: { attended: boolean }) {
  return (
    <SubmitButton
      pendingLabel={attended ? "Undoing…" : "Checking in…"}
      className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold ${
        attended
          ? "border border-stone-300 text-stone-700 hover:bg-stone-100"
          : "bg-emerald-700 text-white hover:bg-emerald-800"
      }`}
    >
      {attended ? "Undo" : "Check in"}
    </SubmitButton>
  );
}

function LateBadge() {
  return (
    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
      Late
    </span>
  );
}

function RemoveButton() {
  return (
    <SubmitButton
      pendingLabel="Removing…"
      className="shrink-0 rounded-lg border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
    >
      Remove
    </SubmitButton>
  );
}

export default async function RosterPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { success?: string; error?: string };
}) {
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

  const attendanceByProfile = new Map(session.attendances.map((a) => [a.profileId, a]));
  const attendedIds = new Set(attendanceByProfile.keys());
  const booked = [...session.bookings.filter((b) => b.status === "BOOKED")].sort((a, b) =>
    a.profile.name.localeCompare(b.profile.name)
  );
  const waitlisted = session.bookings.filter((b) => b.status === "WAITLISTED");
  const walkIns = session.attendances.filter(
    (a) => !session.bookings.some((b) => b.profileId === a.profileId)
  );
  const checkedInCount = session.attendances.length;
  const rosterIds = new Set(session.bookings.map((b) => b.profileId));
  const otherMembers = await prisma.memberProfile.findMany({
    where: {
      id: { notIn: Array.from(rosterIds).concat(Array.from(attendedIds)) },
      deactivatedAt: null,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isChild: true },
  });

  return (
    <div className="space-y-6">
      <Link href="/coach" className="text-sm text-stone-500 hover:text-stone-800">
        &larr; Back to Today
      </Link>

      {searchParams.success && (
        <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
          {searchParams.success}
        </p>
      )}
      {searchParams.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {searchParams.error}
        </p>
      )}

      <section>
        <h1 className="text-2xl font-bold tracking-tight">{session.template.name}</h1>
        <p className="mt-1 text-stone-600">
          {formatDay(session.startsAt)} at {formatTime(session.startsAt)} · {session.instructor}
        </p>
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center justify-between text-sm font-semibold text-emerald-900">
            <span>
              {checkedInCount} of {booked.length} checked in
            </span>
            <span className="font-normal text-emerald-800">
              {booked.length}/{session.template.capacity} booked
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{
                width: `${booked.length ? Math.min((checkedInCount / booked.length) * 100, 100) : 0}%`,
              }}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="roster">
        <h2 id="roster" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Check in booked members
        </h2>
        {booked.length === 0 ? (
          <p className="mt-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-stone-600">
            No bookings yet — use “Check in anyone else” below for walk-ins.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {booked.map((b) => {
              const attendance = attendanceByProfile.get(b.profileId);
              const attended = Boolean(attendance);
              return (
                <li
                  key={b.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-4 shadow-sm ${
                    attended ? "border-emerald-200 bg-emerald-50/60" : "border-stone-200 bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {attended && <span className="mr-1.5 text-emerald-700">✓</span>}
                      {b.profile.name}
                      {attendance?.late && <LateBadge />}
                    </p>
                    <p className="text-sm text-stone-500">
                      {b.profile.isChild ? "Youth member" : "Adult member"} ·{" "}
                      {attended ? (attendance?.late ? "Checked in late" : "Checked in") : "Not checked in"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <form action={toggleAttendance.bind(null, b.profileId, session.id)}>
                      <CheckInButton attended={attended} />
                    </form>
                    {!attended && (
                      <form action={coachRemoveFromRoster.bind(null, b.profileId, session.id)}>
                        <RemoveButton />
                      </form>
                    )}
                  </div>
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
            {waitlisted.map((b) => {
              const attendance = attendanceByProfile.get(b.profileId);
              const attended = Boolean(attendance);
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <p className="min-w-0 truncate font-medium">
                    {b.profile.name}
                    {attendance?.late && <LateBadge />}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <form action={toggleAttendance.bind(null, b.profileId, session.id)}>
                      <CheckInButton attended={attended} />
                    </form>
                    {!attended && (
                      <form action={coachRemoveFromRoster.bind(null, b.profileId, session.id)}>
                        <RemoveButton />
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {walkIns.length > 0 && (
        <section aria-labelledby="walkins">
          <h2 id="walkins" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Walk-ins (checked in without booking)
          </h2>
          <ul className="mt-2 space-y-2">
            {walkIns.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm"
              >
                <p className="min-w-0 truncate font-medium">
                  <span className="mr-1.5 text-emerald-700">✓</span>
                  {a.profile.name}
                  {a.late && <LateBadge />}
                </p>
                <form action={toggleAttendance.bind(null, a.profileId, session.id)}>
                  <CheckInButton attended />
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="add-to-class">
        <h2
          id="add-to-class"
          className="text-sm font-semibold uppercase tracking-wide text-stone-500"
        >
          Add someone to this class
        </h2>
        <form
          action={coachAddToRoster.bind(null, session.id)}
          className="mt-2 flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <div className="min-w-52 flex-1">
            <label htmlFor="add-member" className="mb-1 block text-sm font-medium">
              Book a member into this class
            </label>
            <select
              id="add-member"
              name="profileId"
              required
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            >
              <option value="">Pick a member…</option>
              {otherMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.isChild ? " (youth)" : ""}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton
            pendingLabel="Adding…"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Add to class
          </SubmitButton>
        </form>
      </section>

      <section aria-labelledby="walkin-checkin">
        <h2
          id="walkin-checkin"
          className="text-sm font-semibold uppercase tracking-wide text-stone-500"
        >
          Check in anyone else
        </h2>
        <form
          action={coachWalkInCheckIn.bind(null, session.id)}
          className="mt-2 flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <div className="min-w-52 flex-1">
            <label htmlFor="walkin-member" className="mb-1 block text-sm font-medium">
              Member not on the roster
            </label>
            <select
              id="walkin-member"
              name="profileId"
              required
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            >
              <option value="">Pick a member…</option>
              {otherMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.isChild ? " (youth)" : ""}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton
            pendingLabel="Checking in…"
            className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Check in
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
