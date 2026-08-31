"use client";

import { useFormState, useFormStatus } from "react-dom";
import { convertLeadAction, type FormState } from "@/lib/memberActions";
import { formatPrice } from "@/lib/format";

type PlanOption = {
  id: string;
  name: string;
  priceCents: number;
  billingPeriod: string;
  punchPassClasses: number | null;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Signing up…" : "Sign up as member"}
    </button>
  );
}

export default function ConvertLeadForm({
  leadId,
  defaultName,
  defaultEmail,
  defaultIsChild,
  plans,
}: {
  leadId: string;
  defaultName: string;
  defaultEmail: string;
  defaultIsChild: boolean;
  plans: PlanOption[];
}) {
  const [state, formAction] = useFormState<FormState, FormData>(convertLeadAction, {});

  if (plans.length === 0) {
    return (
      <p className="text-sm text-stone-600">
        Add a membership plan first — plans are seeded in the database and shown on the members
        page.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Member name</span>
          <input
            name="memberName"
            defaultValue={defaultName}
            required
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Plan</span>
          <select
            name="planId"
            defaultValue={plans[0].id}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {formatPrice(plan.priceCents)}
                {plan.punchPassClasses ? ` / ${plan.punchPassClasses} classes` : " / month"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Signup fee collected</span>
          <input
            name="signupFee"
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">First payment collected</span>
          <input
            name="firstPayment"
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Birth year (kids)</span>
          <input
            name="birthYear"
            inputMode="numeric"
            placeholder="2016"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Portal login email</span>
          <input
            name="loginEmail"
            type="email"
            defaultValue={defaultEmail}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isChild" defaultChecked={defaultIsChild} />
          Membership is for a child
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="createLogin" defaultChecked={Boolean(defaultEmail)} />
          Create a portal login
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Submit />
        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
