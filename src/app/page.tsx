import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import ProfilePhotoUploader from "@/components/ProfilePhotoUploader";
import { prisma } from "@/lib/db";
import { requireUser, householdProfiles } from "@/lib/auth";
import { formatDay, formatTime, startOfWeek } from "@/lib/format";
import { trialExpired } from "@/lib/trial";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  if (user.role === "COACH" || user.role === "ADMIN") redirect("/coach");

  const profiles = householdProfiles(user);
  const profileIds = profiles.map((p) => p.id);
  const now = new Date();
  const weekStart = startOfWeek(now);

  const [nextBookings, weekAttendance, announcements, recommended] = await Promise.all([
    prisma.booking.findMany({
      where: {
        profileId: { in: profileIds },
        status: { in: ["BOOKED", "WAITLISTED"] },
        session: { startsAt: { gte: now }, status: "SCHEDULED" },
      },
      include: { session: { include: { template: { include: { program: true } } } }, profile: true },
      orderBy: { session: { startsAt: "asc" } },
    }),
    prisma.attendance.findMany({
      where: { profileId: { in: profileIds }, session: { startsAt: { gte: weekStart } } },
    }),
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.classSession.findMany({
      where: {
        startsAt: { gte: now },
        status: "SCHEDULED",
        template: { name: { not: { startsWith: "Private Trial" } } },
      },
      include: { template: { include: { program: true } }, bookings: { where: { status: "BOOKED" } } },
      orderBy: { startsAt: "asc" },
      take: 30,
    }),
  ]);

  const firstName = user.name.split(" ")[0];
  const bookedSessionIds = new Set(nextBookings.map((b) => b.sessionId));
  const suggestions = recommended
    .filter((s) => !bookedSessionIds.has(s.id))
    .filter((s) => {
      const hasKids = profiles.some((p) => p.isChild);
      const hasAdults = profiles.some((p) => !p.isChild);
      if (s.template.ageGroup === "KIDS") return hasKids;
      if (s.template.ageGroup === "ADULTS") return hasAdults;
      return true;
    })
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <section className="relative -mx-4 -mt-6 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-2xl">
        <Image
          src="/team-photo.jpg"
          alt="Atheneum Martial Arts team on the mats"
          width={1600}
          height={1067}
          priority
          className="h-56 w-full object-cover sm:h-72"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-6">
          <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow sm:text-3xl">
            Welcome back, {firstName}
          </h1>
          <p className="mt-0.5 text-sm text-white/90 drop-shadow">
            Your only limit is your tribe — here&apos;s what you need for your next session.
          </p>
        </div>
      </section>

      <section aria-labelledby="next-class">
        <h2 id="next-class" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Next booked class
        </h2>
        {nextBookings.length === 0 ? (
          <div className="mt-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-stone-700">Nothing booked yet.</p>
            <Link
              href="/schedule"
              className="mt-3 inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Browse the schedule
            </Link>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {nextBookings.slice(0, profiles.length).map((b) => (
              <div key={b.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <p className="font-semibold">
                  {b.session.template.name}
                  {profiles.length > 1 && (
                    <span className="ml-2 text-sm font-normal text-stone-500">for {b.profile.name}</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {formatDay(b.session.startsAt)} at {formatTime(b.session.startsAt)} · {b.session.instructor}
                </p>
                {b.status === "WAITLISTED" && (
                  <p className="mt-1 text-sm font-medium text-amber-700">
                    On the waitlist — we&apos;ll move you in if a spot opens.
                  </p>
                )}
                {b.session.template.gearNotes && (
                  <p className="mt-1 text-sm text-stone-500">
                    Bring: {b.session.template.gearNotes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="membership">
        <h2 id="membership" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Membership
        </h2>
        <div className="mt-2 space-y-3">
          {profiles.map((p) => {
            const remaining =
              p.membershipType === "PUNCH_PASS" && p.punchPassTotal != null
                ? Math.max(p.punchPassTotal - p.punchPassUsed, 0)
                : null;
            return (
              <div key={p.id} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <ProfilePhotoUploader
                      profileId={p.id}
                      name={p.name}
                      photoUrl={
                        p.photoType
                          ? `/api/profile-photo/${p.id}?v=${p.photoUpdatedAt?.getTime() ?? 0}`
                          : null
                      }
                    />
                    <p className="font-medium">
                      {p.name}
                      {p.membershipType === "TRIAL" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                          Trial
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-stone-700">
                    {p.membershipPlan ?? "No plan on file"}
                  </p>
                </div>
                {p.membershipType === "MONTHLY" && p.membershipRenewsAt && (
                  <p className="mt-1 text-sm text-stone-600">
                    Renews {formatDay(p.membershipRenewsAt)}
                  </p>
                )}
                {p.membershipType === "TRIAL" && (
                  <p className="mt-1 text-sm text-stone-600">
                    {p.membershipRenewsAt && !trialExpired(p.membershipRenewsAt) ? (
                      <>
                        Trial ends {formatDay(p.membershipRenewsAt)} — book any class that fits and
                        come train with us. Ask the front desk about membership when you&apos;re
                        ready to keep going.
                      </>
                    ) : (
                      <>
                        Your trial has ended — we&apos;d love to keep training with you! See the
                        front desk to pick a membership.
                      </>
                    )}
                  </p>
                )}
                {remaining != null && p.punchPassTotal != null && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className={remaining <= 2 ? "font-medium text-amber-700" : "text-stone-600"}>
                        {remaining} of {p.punchPassTotal} classes left
                      </span>
                      {remaining <= 2 && <span className="text-amber-700">Time to renew soon</span>}
                    </div>
                    <div
                      className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100"
                      role="progressbar"
                      aria-valuenow={remaining}
                      aria-valuemin={0}
                      aria-valuemax={p.punchPassTotal}
                      aria-label={`${p.name} punch pass classes remaining`}
                    >
                      <div
                        className={`h-full rounded-full ${remaining <= 2 ? "bg-amber-500" : "bg-brand"}`}
                        style={{ width: `${(remaining / p.punchPassTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                {!p.membershipPlan && (
                  <p className="mt-1 text-sm text-stone-500">
                    Ask the front desk to set up your membership details.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="weekly-progress">
        <h2 id="weekly-progress" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          This week
        </h2>
        <div className="mt-2 space-y-3">
          {profiles.map((p) => {
            const count = weekAttendance.filter((a) => a.profileId === p.id).length;
            const remaining = Math.max(p.weeklyGoal - count, 0);
            return (
              <div key={p.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-stone-500">
                    {count} of {p.weeklyGoal} classes
                  </p>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100"
                  role="progressbar"
                  aria-valuenow={count}
                  aria-valuemin={0}
                  aria-valuemax={p.weeklyGoal}
                  aria-label={`${p.name} weekly training progress`}
                >
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${Math.min((count / p.weeklyGoal) * 100, 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  {remaining === 0
                    ? "Weekly goal reached — great consistency!"
                    : `${remaining} more ${remaining === 1 ? "session" : "sessions"} reaches the weekly goal.`}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {suggestions.length > 0 && (
        <section aria-labelledby="recommended">
          <h2 id="recommended" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Recommended classes
          </h2>
          <div className="mt-2 space-y-3">
            {suggestions.map((s) => (
              <Link
                key={s.id}
                href="/schedule"
                className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-stone-400"
              >
                <p className="font-medium">{s.template.name}</p>
                <p className="mt-1 text-sm text-stone-600">
                  {formatDay(s.startsAt)} at {formatTime(s.startsAt)} · {s.instructor}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="announcements">
        <h2 id="announcements" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Announcements
        </h2>
        <div className="mt-2 space-y-3">
          {announcements.length === 0 && (
            <p className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-sm text-stone-600">
              No updates from the coaches right now.
            </p>
          )}
          {announcements.map((a) => (
            <div key={a.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="font-medium">{a.title}</p>
              <p className="mt-1 text-sm text-stone-600">{a.body}</p>
              <p className="mt-2 text-xs text-stone-400">
                {a.author} · {formatDay(a.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
