import Link from "next/link";
import { addChildProfile } from "@/lib/actions";
import { formatDay } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";

export function membershipSummary(p: {
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

export default function HouseholdCard({
  household: h,
}: {
  household: {
    id: string;
    name: string;
    users: { email: string; role: string }[];
    profiles: ({
      id: string;
      name: string;
      isChild: boolean;
      deactivatedAt: Date | null;
      inactiveAt: Date | null;
    } & Parameters<typeof membershipSummary>[0])[];
  };
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{h.name}</p>
        <p className="text-xs text-stone-500">
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
                {p.deactivatedAt && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                    Leaver hold
                  </span>
                )}
                {p.inactiveAt && !p.deactivatedAt && (
                  <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-xs font-semibold text-stone-600">
                    Inactive
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
  );
}
