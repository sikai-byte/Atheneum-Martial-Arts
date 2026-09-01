"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setMembershipStatusAction, type FormState } from "@/lib/memberActions";

const STATUSES = [
  ["ACTIVE", "Active"],
  ["PAST_DUE", "Past due"],
  ["FROZEN", "Frozen"],
  ["CANCELLED", "Cancelled"],
] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-60"
    >
      {pending ? "Updating…" : "Update membership"}
    </button>
  );
}

export default function MembershipStatusForm({
  membershipId,
  status,
}: {
  membershipId: string;
  status: string;
}) {
  const [state, formAction] = useFormState<FormState, FormData>(setMembershipStatusAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="membershipId" value={membershipId} />
      <label className="block text-sm">
        <span className="font-medium">Status</span>
        <select
          name="status"
          defaultValue={status}
          className="mt-1 rounded-lg border border-stone-300 px-3 py-2"
        >
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <input
        name="reason"
        placeholder="Cancel reason (optional)"
        className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      <Submit />
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && <p className="text-sm text-emerald-700">{state.message}</p>}
    </form>
  );
}
