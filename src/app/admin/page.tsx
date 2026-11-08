import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import CreateAccountForm from "@/components/CreateAccountForm";
import HouseholdCard from "@/components/HouseholdCard";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { q?: string; success?: string };
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
    h.users.some((u) => u.role === "MEMBER" || u.role === "PARENT" || u.role === "COACH")
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
        {searchParams.success && (
          <p
            role="status"
            className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          >
            {searchParams.success}
          </p>
        )}
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
          <Link
            href="/admin/feedback"
            className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand/40 hover:shadow-sm"
          >
            <p className="font-semibold text-brand">Member feedback &rarr;</p>
            <p className="mt-1 text-xs text-stone-500">
              Bug reports and ideas sent through the in-app feedback form, with resolve tracking.
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
        <CreateAccountForm allowStaffRoles />
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
            <HouseholdCard key={h.id} household={h} />
          ))}
        </div>
      </section>
    </div>
  );
}
