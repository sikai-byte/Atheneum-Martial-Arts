import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { addChildProfile, createMemberAccount } from "@/lib/actions";
import { formatDay } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function membershipSummary(p: {
  membershipPlan: string | null;
  membershipType: string | null;
  membershipRenewsAt: Date | null;
  punchPassTotal: number | null;
  punchPassUsed: number;
}) {
  if (!p.membershipPlan) return "No membership";
  if (p.membershipType === "PUNCH_PASS" && p.punchPassTotal) {
    return `${p.membershipPlan} · ${Math.max(p.punchPassTotal - p.punchPassUsed, 0)} of ${p.punchPassTotal} left`;
  }
  if (p.membershipType === "TRIAL") {
    return p.membershipRenewsAt
      ? `Trial · ends ${formatDay(p.membershipRenewsAt)}`
      : "Trial";
  }
  if (p.membershipRenewsAt) {
    return `${p.membershipPlan} · renews ${formatDay(p.membershipRenewsAt)}`;
  }
  return p.membershipPlan;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const admin = await requireAdmin();

  const [households, memberCount, coachCount, openOrders] = await Promise.all([
    prisma.household.findMany({
      include: {
        users: { orderBy: { name: "asc" } },
        profiles: { orderBy: [{ isChild: "asc" }, { name: "asc" }] },
      },
      orderBy: { name: "asc" },
    }),
    prisma.user.count({ where: { role: { in: ["MEMBER", "PARENT"] } } }),
    prisma.user.count({ where: { role: "COACH" } }),
    prisma.order.count({ where: { status: { in: ["PLACED", "READY"] } } }),
  ]);

  const memberHouseholds = households.filter((h) =>
    h.users.some((u) => u.role === "MEMBER" || u.role === "PARENT")
  );
  const query = (searchParams.q ?? "").trim().toLowerCase();
  const visibleHouseholds = query
    ? memberHouseholds.filter(
        (h) =>
          h.name.toLowerCase().includes(query) ||
          h.users.some(
            (u) =>
              u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
          ) ||
          h.profiles.some((p) => p.name.toLowerCase().includes(query))
      )
    : memberHouseholds;
  const childCount = households.reduce(
    (n, h) => n + h.profiles.filter((p) => p.isChild).length,
    0
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="mt-1 text-stone-600">
          Welcome, {admin.name}. Manage member accounts, households, and memberships.
        </p>
      </section>

      <section aria-labelledby="admin-stats">
        <h2 id="admin-stats" className="sr-only">
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Member accounts", value: memberCount },
            { label: "Kids profiles", value: childCount },
            { label: "Coaches", value: coachCount },
            { label: "Open shop orders", value: openOrders },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="text-2xl font-bold text-brand">{s.value}</p>
              <p className="mt-1 text-xs text-stone-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="analytics-link">
        <h2 id="analytics-link" className="sr-only">
          Analytics &amp; history
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/admin/activity"
            className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand/40 hover:shadow-sm"
          >
            <p className="font-semibold text-brand">Member activity &rarr;</p>
            <p className="mt-1 text-xs text-stone-500">
              Who has signed in and used the app — last seen, bookings, and posts per person since
              onboarding.
            </p>
          </Link>
          <Link
            href="/admin/kiosk"
            className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand/40 hover:shadow-sm"
          >
            <p className="font-semibold text-brand">Front-desk kiosk &rarr;</p>
            <p className="mt-1 text-xs text-stone-500">
              Turn this device into the check-in kiosk and print the QR poster for walk-in
              registration.
            </p>
          </Link>
          <Link
            href="/admin/analytics"
            className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand/40 hover:shadow-sm"
          >
            <p className="font-semibold text-brand">Analytics &rarr;</p>
            <p className="mt-1 text-xs text-stone-500">
              Weekly active members, booking adoption, attendance, retention &amp; churn, absence
              outreach lists, and staff time saved.
            </p>
          </Link>
          <Link
            href="/admin/audit"
            className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand/40 hover:shadow-sm"
          >
            <p className="font-semibold text-brand">Audit history &rarr;</p>
            <p className="mt-1 text-xs text-stone-500">
              A complete record of every admin and coach action — accounts, bookings, memberships,
              content edits, and moderation.
            </p>
          </Link>
          <Link
            href="/admin/waivers"
            className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand/40 hover:shadow-sm"
          >
            <p className="font-semibold text-brand">Waivers &rarr;</p>
            <p className="mt-1 text-xs text-stone-500">
              Who has a signed liability waiver on file — and who still needs one before training.
            </p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="edit-content">
        <h2 id="edit-content" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Edit site content
        </h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {[
            {
              href: "/admin/coaches",
              title: "Coaches",
              blurb: "Names, bios, disciplines, and photos on the Coaches page.",
            },
            {
              href: "/admin/shop",
              title: "Shop products",
              blurb: "Prices, sizes, descriptions, and adding or retiring items.",
            },
            {
              href: "/admin/schedule",
              title: "Schedule & classes",
              blurb: "Weekly time slots, class details, capacity, and cancellations.",
            },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand/40 hover:shadow-sm"
            >
              <p className="font-semibold text-brand">{card.title} &rarr;</p>
              <p className="mt-1 text-xs text-stone-500">{card.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="create-account">
        <h2 id="create-account" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Create an account
        </h2>
        <form
          action={createMemberAccount}
          className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <p className="text-sm text-stone-600">
            Creates a login and a new household. Share the temporary password with the member and
            ask them to keep it safe.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new-name" className="mb-1 block text-sm font-medium">
                Full name
              </label>
              <input
                id="new-name"
                name="name"
                required
                maxLength={80}
                placeholder="e.g. Sam Johnson"
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input
                id="new-email"
                name="email"
                type="email"
                required
                placeholder="e.g. sam@example.com"
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-password" className="mb-1 block text-sm font-medium">
                Temporary password
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
            <div>
              <label htmlFor="new-role" className="mb-1 block text-sm font-medium">
                Role
              </label>
              <select
                id="new-role"
                name="role"
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              >
                <option value="MEMBER">Member (trains themselves)</option>
                <option value="PARENT">Parent (manages kids)</option>
                <option value="COACH">Coach</option>
                <option value="ADMIN">Admin (member management)</option>
              </select>
            </div>
          </div>
          <fieldset className="rounded-lg border border-stone-200 bg-stone-50 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Trial account
            </legend>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="trial" className="h-4 w-4 rounded border-stone-300" />
                This is a trial (member or parent only)
              </label>
              <div>
                <label htmlFor="trial-ends" className="mb-1 block text-xs font-medium">
                  Trial ends (default: 1 week from today)
                </label>
                <input
                  id="trial-ends"
                  name="trialEndsAt"
                  type="date"
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="trial-class-type" className="mb-1 block text-xs font-medium">
                  Trial classes allowed
                </label>
                <select
                  id="trial-class-type"
                  name="trialClassType"
                  defaultValue="BOTH"
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  <option value="BOTH">Group and private</option>
                  <option value="GROUP">Group classes only</option>
                  <option value="PRIVATE">Private trial only</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Trial members can browse everything and book classes until their trial ends. After
              creating the account you land on their page to book their first class (group or
              private) and copy the sign-in text for your lead bot.
            </p>
          </fieldset>
          <SubmitButton
            pendingLabel="Creating…"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Create account
          </SubmitButton>
        </form>
      </section>

      <section aria-labelledby="households">
        <h2 id="households" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Members &amp; households
        </h2>
        <form action="/admin" className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="member-search" className="sr-only">
            Search members
          </label>
          <input
            id="member-search"
            name="q"
            type="search"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search by name or email…"
            className="w-full max-w-sm rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Search
          </button>
          {query && (
            <Link href="/admin" className="text-sm font-medium text-brand hover:underline">
              Clear
            </Link>
          )}
        </form>
        {query && (
          <p className="mt-2 text-sm text-stone-500">
            {visibleHouseholds.length}{" "}
            {visibleHouseholds.length === 1 ? "household matches" : "households match"} “
            {searchParams.q?.trim()}”
          </p>
        )}
        <div className="mt-2 space-y-3">
          {memberHouseholds.length === 0 && (
            <p className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-sm text-stone-600">
              No member households yet — create the first account above.
            </p>
          )}
          {memberHouseholds.length > 0 && visibleHouseholds.length === 0 && (
            <p className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-sm text-stone-600">
              No members match that search — check the spelling or clear the search.
            </p>
          )}
          {visibleHouseholds.map((h) => (
            <div key={h.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{h.name}</p>
                <p className="text-xs text-stone-400">
                  {h.users.map((u) => `${u.email} (${u.role.toLowerCase()})`).join(", ")}
                </p>
              </div>
              <ul className="mt-3 space-y-2">
                {h.profiles.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {p.name}
                        {p.isChild && (
                          <span className="ml-2 rounded bg-brand-light px-1.5 py-0.5 text-xs text-brand">
                            Child
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">{membershipSummary(p)}</p>
                    </div>
                    <Link
                      href={`/admin/member/${p.id}`}
                      className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
                    >
                      Manage
                    </Link>
                  </li>
                ))}
              </ul>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-brand">
                  Add a child to this household
                </summary>
                <form
                  action={addChildProfile.bind(null, h.id)}
                  className="mt-2 flex flex-wrap items-end gap-3"
                >
                  <div className="min-w-40 flex-1">
                    <label htmlFor={`child-name-${h.id}`} className="mb-1 block text-xs font-medium">
                      Child&apos;s name
                    </label>
                    <input
                      id={`child-name-${h.id}`}
                      name="name"
                      required
                      maxLength={80}
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="w-28">
                    <label htmlFor={`child-year-${h.id}`} className="mb-1 block text-xs font-medium">
                      Birth year
                    </label>
                    <input
                      id={`child-year-${h.id}`}
                      name="birthYear"
                      type="number"
                      min={2005}
                      max={new Date().getFullYear()}
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <SubmitButton
                    pendingLabel="Adding…"
                    className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                  >
                    Add child
                  </SubmitButton>
                </form>
              </details>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
