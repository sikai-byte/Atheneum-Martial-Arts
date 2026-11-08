import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireMemberManager } from "@/lib/auth";
import CreateAccountForm from "@/components/CreateAccountForm";
import HouseholdCard from "@/components/HouseholdCard";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 15;

export default async function CoachMembersPage({
  searchParams,
}: {
  searchParams: { q?: string; error?: string };
}) {
  const user = await requireMemberManager();
  const query = (searchParams.q ?? "").trim();
  const contains = { contains: query, mode: "insensitive" as const };

  const households = await prisma.household.findMany({
    where: {
      users: {
        some: { role: { in: ["MEMBER", "PARENT"] } },
        none: { role: { in: ["COACH", "ADMIN"] } },
      },
      ...(query
        ? {
            OR: [
              { name: contains },
              { users: { some: { OR: [{ name: contains }, { email: contains }] } } },
              { profiles: { some: { name: contains } } },
            ],
          }
        : {}),
    },
    include: {
      users: { orderBy: { name: "asc" } },
      profiles: { orderBy: [{ isChild: "asc" }, { name: "asc" }] },
    },
    orderBy: { id: "desc" }, // cuids are time-ordered: newest households first
    take: query ? 50 : RECENT_LIMIT,
  });

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Members</h1>
        <p className="mt-1 text-stone-600">
          Add a new member, set up their membership, then send the onboarding email so they can
          choose their password and sign in.
        </p>
        {searchParams.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {searchParams.error}
          </p>
        )}
      </section>

      <section aria-labelledby="create-account">
        <h2 id="create-account" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Add a member account
        </h2>
        <CreateAccountForm allowStaffRoles={user.role === "ADMIN"} />
      </section>

      <section aria-labelledby="households">
        <h2 id="households" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          {query ? "Matching households" : "Newest households"}
        </h2>
        <form action="/coach/members" className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="member-search" className="sr-only">
            Search members
          </label>
          <input
            id="member-search"
            name="q"
            type="search"
            defaultValue={query}
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
            <Link href="/coach/members" className="text-sm font-medium text-brand hover:underline">
              Clear
            </Link>
          )}
        </form>
        <div className="mt-2 space-y-3">
          {households.length === 0 && (
            <p className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-sm text-stone-600">
              {query ? "No members match that search." : "No member households yet."}
            </p>
          )}
          {households.map((h) => (
            <HouseholdCard key={h.id} household={h} />
          ))}
        </div>
      </section>
    </div>
  );
}
