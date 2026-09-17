/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import ProfilePhotoUploader from "@/components/ProfilePhotoUploader";
import StartHereBanner from "@/components/StartHereBanner";
import { prisma } from "@/lib/db";
import { requireUser, householdProfiles } from "@/lib/auth";
import { formatDay, formatTime, startOfWeek } from "@/lib/format";
import { trialExpired } from "@/lib/trial";

export const dynamic = "force-dynamic";

const MEDALS = ["🥇", "🥈", "🥉"];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function photoUrl(p: { id: string; photoType: string | null; photoUpdatedAt: Date | null }) {
  return p.photoType ? `/api/profile-photo/${p.id}?v=${p.photoUpdatedAt?.getTime() ?? 0}` : null;
}

export default async function HomePage() {
  const user = await requireUser();
  if (user.role === "COACH" || user.role === "ADMIN") redirect("/coach");

  const profiles = householdProfiles(user);
  const profileIds = profiles.map((p) => p.id);
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    nextBookings,
    weekAttendance,
    announcements,
    recommended,
    latestPost,
    monthGrouped,
    allTimeOwn,
  ] = await Promise.all([
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
    prisma.post.findFirst({
      include: {
        author: { select: { name: true, role: true } },
        media: { orderBy: { position: "asc" }, take: 1 },
        _count: { select: { comments: true, reactions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.attendance.groupBy({
      by: ["profileId"],
      where: { session: { startsAt: { gte: monthStart } } },
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ["profileId"],
      where: { profileId: { in: profileIds } },
      _count: { _all: true },
    }),
  ]);

  const rankedProfiles =
    monthGrouped.length > 0
      ? await prisma.memberProfile.findMany({
          where: { id: { in: monthGrouped.map((g) => g.profileId) }, deactivatedAt: null },
          select: { id: true, name: true, isChild: true, photoType: true, photoUpdatedAt: true },
        })
      : [];
  const rankedById = new Map(rankedProfiles.map((p) => [p.id, p]));
  const monthEntries = monthGrouped
    .flatMap((g) => {
      const p = rankedById.get(g.profileId);
      if (!p) return [];
      return [{ ...p, count: g._count._all }];
    })
    .sort((a, b) => b.count - a.count);
  const adultBoard = monthEntries.filter((e) => !e.isChild);
  const kidsBoard = monthEntries.filter((e) => e.isChild);

  const monthCountByProfile = new Map(monthGrouped.map((g) => [g.profileId, g._count._all]));
  const allTimeByProfile = new Map(allTimeOwn.map((g) => [g.profileId, g._count._all]));

  const standing = profiles.map((p) => {
    const board = p.isChild ? kidsBoard : adultBoard;
    const monthCount = monthCountByProfile.get(p.id) ?? 0;
    const rank = monthCount > 0 ? board.findIndex((e) => e.id === p.id) + 1 : 0;
    return {
      profile: p,
      monthCount,
      rank: rank > 0 ? rank : null,
      boardSize: board.length,
      allTime: allTimeByProfile.get(p.id) ?? 0,
      weekCount: weekAttendance.filter((a) => a.profileId === p.id).length,
    };
  });

  const hasKids = profiles.some((p) => p.isChild);
  const hasAdults = profiles.some((p) => !p.isChild);
  const teamBoards: { title: string; entries: typeof monthEntries }[] = [];
  if (hasAdults || !hasKids) teamBoards.push({ title: "Adults", entries: adultBoard.slice(0, 5) });
  if (hasKids) teamBoards.push({ title: "Kids", entries: kidsBoard.slice(0, 5) });

  const heroWeek = standing.reduce((sum, s) => sum + s.weekCount, 0);
  const heroMonth = standing.reduce((sum, s) => sum + s.monthCount, 0);
  const bestRank = standing.reduce<number | null>(
    (best, s) => (s.rank !== null && (best === null || s.rank < best) ? s.rank : best),
    null
  );

  const firstName = user.name.split(" ")[0];
  const bookedSessionIds = new Set(nextBookings.map((b) => b.sessionId));
  const suggestions = recommended
    .filter((s) => !bookedSessionIds.has(s.id))
    .filter((s) => {
      if (s.template.ageGroup === "KIDS") return hasKids;
      if (s.template.ageGroup === "ADULTS") return hasAdults;
      return true;
    })
    .slice(0, 3);

  const monthName = now.toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="space-y-8">
      <section className="relative -mx-4 -mt-6 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-2xl">
        <Image
          src="/team-photo.jpg"
          alt="Atheneum Martial Arts team on the mats"
          width={1600}
          height={1067}
          priority
          className="h-72 w-full object-cover sm:h-96"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-6">
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow sm:text-4xl">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 text-sm text-white/90 drop-shadow sm:text-base">
            Your only limit is your tribe.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white backdrop-blur">
              {heroWeek} {heroWeek === 1 ? "class" : "classes"} this week
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white backdrop-blur">
              {heroMonth} in {monthName}
            </span>
            {bestRank !== null && (
              <span className="rounded-full bg-amber-400/90 px-3 py-1 text-sm font-semibold text-stone-900">
                #{bestRank} on the leaderboard
              </span>
            )}
          </div>
        </div>
      </section>

      {!user.startHereDismissedAt && <StartHereBanner />}

      <section aria-label="Quick links" className="grid grid-cols-3 gap-3">
        <Link
          href="/schedule"
          className="rounded-xl border border-stone-200 bg-white p-3 text-center shadow-sm hover:border-stone-400"
        >
          <span className="text-xl" aria-hidden>📅</span>
          <p className="mt-1 text-sm font-semibold">Book classes</p>
        </Link>
        <Link
          href="/community"
          className="rounded-xl border border-stone-200 bg-white p-3 text-center shadow-sm hover:border-stone-400"
        >
          <span className="text-xl" aria-hidden>💬</span>
          <p className="mt-1 text-sm font-semibold">Community</p>
        </Link>
        <Link
          href="/shop"
          className="rounded-xl border border-stone-200 bg-white p-3 text-center shadow-sm hover:border-stone-400"
        >
          <span className="text-xl" aria-hidden>🛍️</span>
          <p className="mt-1 text-sm font-semibold">Gear shop</p>
        </Link>
      </section>

      <section aria-labelledby="next-class">
        <h2 id="next-class" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Upcoming classes
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
            {nextBookings.slice(0, Math.max(profiles.length, 2)).map((b) => (
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

      <section aria-labelledby="your-standing">
        <h2 id="your-standing" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Your standing
        </h2>
        <div className="mt-2 space-y-3">
          {standing.map(({ profile: p, monthCount, rank, boardSize, allTime }) => (
            <div
              key={p.id}
              className="rounded-xl bg-gradient-to-r from-brand to-brand-dark p-4 text-white shadow-sm"
            >
              <div className="flex items-center gap-3">
                {photoUrl(p) ? (
                  <img src={photoUrl(p)!} alt="" className="h-11 w-11 rounded-full border-2 border-white/40 object-cover" />
                ) : (
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/40 bg-white/20 text-sm font-semibold">
                    {initials(p.name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-sm text-white/80">
                    {rank !== null
                      ? `#${rank} of ${boardSize} ${p.isChild ? "kids" : "adults"} in ${monthName}`
                      : `No check-ins yet in ${monthName} — your next class starts the climb.`}
                  </p>
                </div>
                {rank !== null && rank <= 3 && (
                  <span className="text-3xl" aria-hidden>
                    {MEDALS[rank - 1]}
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-white/10 px-2 py-1.5">
                  <p className="text-xl font-bold">{monthCount}</p>
                  <p className="text-xs text-white/80">classes in {monthName}</p>
                </div>
                <div className="rounded-lg bg-white/10 px-2 py-1.5">
                  <p className="text-xl font-bold">{allTime}</p>
                  <p className="text-xs text-white/80">all-time classes</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="team-leaderboard">
        <div className="flex items-center justify-between">
          <h2
            id="team-leaderboard"
            className="text-sm font-semibold uppercase tracking-wide text-stone-500"
          >
            Team leaderboard — {monthName}
          </h2>
          <Link href="/leaderboard" className="text-sm font-medium text-brand hover:underline">
            Full board
          </Link>
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {teamBoards.map(({ title, entries }) => (
            <div key={title} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</p>
              {entries.length === 0 ? (
                <p className="mt-2 text-sm text-stone-600">
                  No check-ins yet — the first class attended starts the race.
                </p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {entries.map((e, i) => (
                    <li key={e.id} className="flex items-center gap-3">
                      <span className="w-7 text-center text-base font-bold text-stone-500">
                        {MEDALS[i] ?? i + 1}
                      </span>
                      {photoUrl(e) ? (
                        <img src={photoUrl(e)!} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600">
                          {initials(e.name)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                      <span className="text-sm text-stone-600">
                        <span className="font-bold text-stone-900">{e.count}</span>{" "}
                        {e.count === 1 ? "class" : "classes"}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="community-posts">
        <div className="flex items-center justify-between">
          <h2
            id="community-posts"
            className="text-sm font-semibold uppercase tracking-wide text-stone-500"
          >
            From the community
          </h2>
          <Link href="/community" className="text-sm font-medium text-brand hover:underline">
            See all
          </Link>
        </div>
        <div className="mt-2">
          {!latestPost ? (
            <p className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-sm text-stone-600">
              No posts yet — be the first to share something with the tribe!
            </p>
          ) : (
            <Link
              href="/community"
              className="block overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm hover:border-stone-400"
            >
              {latestPost.media[0] &&
                (latestPost.media[0].kind === "VIDEO" ? (
                  <div className="relative h-44 w-full bg-black">
                    <video
                      src={`/api/post-media/${latestPost.media[0].id}`}
                      playsInline
                      muted
                      preload="metadata"
                      className="pointer-events-none h-44 w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-6 w-6" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                  </div>
                ) : (
                  <img
                    src={`/api/post-media/${latestPost.media[0].id}`}
                    alt=""
                    className="h-44 w-full object-cover"
                  />
                ))}
              {!latestPost.media[0] && latestPost.photoType && (
                <img
                  src={`/api/post-photo/${latestPost.id}`}
                  alt=""
                  className="h-44 w-full object-cover"
                />
              )}
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{latestPost.author.name}</p>
                  {(latestPost.author.role === "COACH" || latestPost.author.role === "ADMIN") && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      Staff
                    </span>
                  )}
                  <p className="text-xs text-stone-400">{formatDay(latestPost.createdAt)}</p>
                </div>
                {latestPost.title && <p className="mt-1 font-medium">{latestPost.title}</p>}
                <p className="mt-1 line-clamp-2 text-sm text-stone-600">{latestPost.body}</p>
                <p className="mt-2 text-xs text-stone-400">
                  {latestPost._count.reactions > 0 &&
                    `${latestPost._count.reactions} reaction${latestPost._count.reactions === 1 ? "" : "s"} · `}
                  {latestPost._count.comments} comment{latestPost._count.comments === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          )}
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
                {p.membershipType === "MONTHLY" &&
                  p.membershipRenewsAt &&
                  (p.membershipRenewsAt < now ? (
                    <p className="mt-1 text-sm font-medium text-amber-700">
                      Membership expired {formatDay(p.membershipRenewsAt)} — to re-up, contact
                      Coach Sikai at{" "}
                      <a href="tel:6125583765" className="underline">
                        612-558-3765
                      </a>
                      .
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-stone-600">
                      Renews {formatDay(p.membershipRenewsAt)}
                    </p>
                  ))}
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
                    {remaining <= 2 && (
                      <p className="mt-1 text-sm text-amber-700">
                        To re-up, contact Coach Sikai at{" "}
                        <a href="tel:6125583765" className="underline">
                          612-558-3765
                        </a>
                        .
                      </p>
                    )}
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
