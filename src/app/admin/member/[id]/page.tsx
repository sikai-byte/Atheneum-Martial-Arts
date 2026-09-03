import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  adminBookClass,
  adminBookPrivateTrial,
  adminCancelBooking,
  resetMemberPassword,
  updateMembership,
} from "@/lib/actions";
import { formatDay, formatTime } from "@/lib/format";
import { appUrl } from "@/lib/email";
import CopyButton from "@/components/CopyButton";
import MembershipFields from "@/components/MembershipFields";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function AdminMemberPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; success?: string };
}) {
  await requireAdmin();

  const profile = await prisma.memberProfile.findUnique({
    where: { id: params.id },
    include: { user: true, household: true },
  });
  if (!profile) notFound();

  const renewsAtValue = profile.membershipRenewsAt
    ? profile.membershipRenewsAt.toISOString().slice(0, 10)
    : "";

  const now = new Date();
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const upcomingSessions = await prisma.classSession.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { gt: now, lt: twoWeeks },
      template: { name: { not: { startsWith: "Private Trial" } } },
    },
    include: { template: true },
    orderBy: { startsAt: "asc" },
  });
  const upcomingBookings = await prisma.booking.findMany({
    where: {
      profileId: profile.id,
      status: { in: ["BOOKED", "WAITLISTED"] },
      session: { startsAt: { gt: now } },
    },
    include: { session: { include: { template: true } } },
    orderBy: { session: { startsAt: "asc" } },
  });

  const isTrial = profile.membershipType === "TRIAL";
  const canBookGroup = !isTrial || profile.trialClassType !== "PRIVATE";
  const canBookPrivate = !isTrial || profile.trialClassType !== "GROUP";

  const nextBooking = upcomingBookings[0];
  const firstName = profile.name.split(" ")[0];
  const inviteText = [
    `Hi ${firstName}! Your ${profile.membershipType === "TRIAL" ? "trial " : ""}class at Atheneum Martial Arts is ${
      nextBooking
        ? `booked: ${nextBooking.session.template.name} on ${formatDay(nextBooking.session.startsAt)} at ${formatTime(nextBooking.session.startsAt)}.`
        : "ready to book."
    }`,
    `Sign in to see your class and everything else: ${appUrl()}`,
    profile.user
      ? `Login: ${profile.user.email} / password: <temp password you set>`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-8">
      <section>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          &larr; Back to Admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{profile.name}</h1>
        {searchParams.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {searchParams.error}
          </p>
        )}
        {searchParams.success && (
          <p
            role="status"
            className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          >
            {searchParams.success}
          </p>
        )}
        <p className="mt-1 text-stone-600">
          {profile.household.name}
          {profile.isChild
            ? " · child profile"
            : profile.user
              ? ` · ${profile.user.email} (${profile.user.role.toLowerCase()})`
              : ""}
        </p>
      </section>

      {isTrial && (
        <section aria-labelledby="trial-setup">
          <h2 id="trial-setup" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Trial setup
          </h2>
          <ol className="mt-2 space-y-1.5 rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-sm">
            {[
              { done: true, label: "Account created — welcome email sent with sign-in details" },
              {
                done: upcomingBookings.length > 0,
                label:
                  upcomingBookings.length > 0
                    ? `First class booked — ${upcomingBookings[0].session.template.name}, ${formatDay(upcomingBookings[0].session.startsAt)}`
                    : "Book their first class below (group or private)",
              },
              {
                done: false,
                label: "Optional: text them the sign-in details via your lead bot",
              },
            ].map((step, i) => (
              <li key={i} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step.done ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {step.done ? "\u2713" : i + 1}
                </span>
                <span className={step.done ? "text-stone-700" : "text-stone-600"}>{step.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="membership">
        <h2 id="membership" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Membership
        </h2>
        <form
          action={updateMembership.bind(null, profile.id)}
          className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <MembershipFields
            membershipPlan={profile.membershipPlan ?? ""}
            membershipType={profile.membershipType ?? ""}
            renewsAtValue={renewsAtValue}
            trialClassType={profile.trialClassType}
            punchPassTotal={profile.punchPassTotal}
            punchPassUsed={profile.punchPassUsed}
          />
          <p className="text-xs text-stone-500">
            Members have one membership at a time — saving a type clears the other types&apos;
            details.
          </p>
          <SubmitButton
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Save membership
          </SubmitButton>
        </form>
      </section>

      <section aria-labelledby="book-class">
        <h2 id="book-class" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Book a class for {firstName}
        </h2>
        {isTrial && (!canBookGroup || !canBookPrivate) && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This trial is limited to {canBookGroup ? "group classes" : "a private trial"} only —
            change “Trial classes allowed” in Membership to open up the other option.
          </p>
        )}
        <div className="mt-2 grid gap-4 lg:grid-cols-2">
          {canBookGroup && (
          <form
            action={adminBookClass.bind(null, profile.id)}
            className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm font-semibold">Group class</p>
            <p className="text-xs text-stone-500">
              Any regular class on the schedule in the next two weeks.
            </p>
            <select
              name="sessionId"
              required
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            >
              <option value="">Pick a class…</option>
              {upcomingSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.template.name} — {formatDay(s.startsAt)}, {formatTime(s.startsAt)}
                </option>
              ))}
            </select>
            <SubmitButton
              pendingLabel="Booking…"
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Book group class
            </SubmitButton>
          </form>
          )}

          {canBookPrivate && (
          <form
            action={adminBookPrivateTrial.bind(null, profile.id)}
            className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm font-semibold">Private trial</p>
            <p className="text-xs text-stone-500">
              One-on-one intro session, 8:00 AM–8:00 PM, in any open slot with no group class.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pt-date" className="mb-1 block text-sm font-medium">
                  Date
                </label>
                <input
                  id="pt-date"
                  name="date"
                  type="date"
                  required
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="pt-time" className="mb-1 block text-sm font-medium">
                  Start time
                </label>
                <input
                  id="pt-time"
                  name="time"
                  type="time"
                  min="08:00"
                  max="19:30"
                  step={900}
                  required
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="pt-duration" className="mb-1 block text-sm font-medium">
                  Length
                </label>
                <select
                  id="pt-duration"
                  name="duration"
                  defaultValue="30"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
                >
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">1 hour</option>
                </select>
              </div>
              <div>
                <label htmlFor="pt-instructor" className="mb-1 block text-sm font-medium">
                  Coach
                </label>
                <input
                  id="pt-instructor"
                  name="instructor"
                  placeholder="Atheneum Coach"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
                />
              </div>
            </div>
            <SubmitButton
              pendingLabel="Booking…"
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Book private trial
            </SubmitButton>
          </form>
          )}
        </div>

        {upcomingBookings.length > 0 && (
          <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold">Upcoming bookings</p>
            <ul className="mt-2 divide-y divide-stone-100">
              {upcomingBookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm">
                    {b.session.template.name} — {formatDay(b.session.startsAt)},{" "}
                    {formatTime(b.session.startsAt)}
                    {b.status === "WAITLISTED" && (
                      <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-semibold text-stone-600">
                        Waitlisted
                      </span>
                    )}
                  </span>
                  <form action={adminCancelBooking.bind(null, profile.id, b.sessionId)}>
                    <SubmitButton
                      pendingLabel="Cancelling…"
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                    >
                      Cancel
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {profile.user && (
        <section aria-labelledby="invite-text">
          <h2 id="invite-text" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Sign-in text for your lead bot
          </h2>
          <div className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-stone-600">
              Trial members are emailed their sign-in details automatically when the account is
              created, and again when you book their class. Use this text if you also want to
              send it by SMS — replace the password placeholder with the temp password you set.
            </p>
            <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-800">{inviteText}</p>
            <CopyButton text={inviteText} />
          </div>
        </section>
      )}

      {profile.user && (
        <section aria-labelledby="reset-password">
          <h2
            id="reset-password"
            className="text-sm font-semibold uppercase tracking-wide text-stone-500"
          >
            Reset password
          </h2>
          <form
            action={resetMemberPassword.bind(null, profile.user.id, profile.id)}
            className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm text-stone-600">
              Sets a new password for {profile.user.email}. Share it with the member directly.
            </p>
            <div className="sm:max-w-xs">
              <label htmlFor="new-password" className="mb-1 block text-sm font-medium">
                New password
              </label>
              <input
                id="new-password"
                name="password"
                type="text"
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>
            <SubmitButton
              pendingLabel="Resetting…"
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Reset password
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
