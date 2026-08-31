import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { resetMemberPassword, updateMembership } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function AdminMemberPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const profile = await prisma.memberProfile.findUnique({
    where: { id: params.id },
    include: { user: true, household: true },
  });
  if (!profile) notFound();

  const renewsAtValue = profile.membershipRenewsAt
    ? profile.membershipRenewsAt.toISOString().slice(0, 10)
    : "";

  return (
    <div className="space-y-8">
      <section>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          &larr; Back to Admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{profile.name}</h1>
        <p className="mt-1 text-stone-600">
          {profile.household.name}
          {profile.isChild
            ? " · child profile"
            : profile.user
              ? ` · ${profile.user.email} (${profile.user.role.toLowerCase()})`
              : ""}
        </p>
      </section>

      <section aria-labelledby="membership">
        <h2 id="membership" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Membership
        </h2>
        <form
          action={updateMembership.bind(null, profile.id)}
          className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="membership-plan" className="mb-1 block text-sm font-medium">
                Plan name
              </label>
              <input
                id="membership-plan"
                name="membershipPlan"
                maxLength={80}
                defaultValue={profile.membershipPlan ?? ""}
                placeholder="e.g. Adult Unlimited"
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="membership-type" className="mb-1 block text-sm font-medium">
                Type
              </label>
              <select
                id="membership-type"
                name="membershipType"
                defaultValue={profile.membershipType ?? ""}
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              >
                <option value="">None</option>
                <option value="MONTHLY">Monthly (renews on a date)</option>
                <option value="PUNCH_PASS">Punch pass (class count)</option>
              </select>
            </div>
            <div>
              <label htmlFor="membership-renews" className="mb-1 block text-sm font-medium">
                Renews on (monthly plans)
              </label>
              <input
                id="membership-renews"
                name="membershipRenewsAt"
                type="date"
                defaultValue={renewsAtValue}
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="punch-total" className="mb-1 block text-sm font-medium">
                  Pass size
                </label>
                <input
                  id="punch-total"
                  name="punchPassTotal"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={profile.punchPassTotal ?? 10}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="punch-used" className="mb-1 block text-sm font-medium">
                  Classes used
                </label>
                <input
                  id="punch-used"
                  name="punchPassUsed"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={profile.punchPassUsed}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-stone-500">
            Punch-pass fields only apply to punch-pass memberships; the renewal date only applies
            to monthly plans.
          </p>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Save membership
          </button>
        </form>
      </section>

      {profile.user && (
        <section aria-labelledby="reset-password">
          <h2
            id="reset-password"
            className="text-sm font-semibold uppercase tracking-wide text-stone-500"
          >
            Reset password
          </h2>
          <form
            action={resetMemberPassword.bind(null, profile.user.id)}
            className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4"
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
            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Reset password
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
