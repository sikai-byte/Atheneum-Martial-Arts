"use client";

import { useFormState, useFormStatus } from "react-dom";
import { recordPaymentAction, type FormState } from "@/lib/memberActions";

const KINDS = [
  ["DUES", "Monthly dues"],
  ["SIGNUP_FEE", "Signup fee"],
  ["PUNCH_PASS", "Punch pass"],
  ["PRIVATE_LESSON", "Private lesson"],
  ["RETAIL", "Gear / retail"],
  ["OTHER", "Other"],
] as const;

const METHODS = [
  ["MANUAL", "Recorded by hand"],
  ["CASH", "Cash"],
  ["CARD_TERMINAL", "Card terminal"],
  ["STRIPE", "Stripe"],
] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary btn-md"
    >
      {pending ? "Recording…" : "Record payment"}
    </button>
  );
}

export default function PaymentForm({ profileId }: { profileId: string }) {
  const [state, formAction] = useFormState<FormState, FormData>(recordPaymentAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="profileId" value={profileId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium">Amount</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="149.00"
            className="mt-1 field-input"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">For</span>
          <select
            name="kind"
            className="mt-1 field-input"
          >
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Method</span>
          <select
            name="method"
            className="mt-1 field-input"
          >
            {METHODS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        name="description"
        placeholder="Note (optional)"
        className="field-input"
      />
      <div className="flex items-center gap-3">
        <Submit />
        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.message && <p className="text-sm text-emerald-700">{state.message}</p>}
      </div>
    </form>
  );
}
