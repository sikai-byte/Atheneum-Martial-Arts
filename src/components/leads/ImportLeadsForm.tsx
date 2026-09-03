"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importLeadsAction, type FormState } from "@/lib/leadActions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Importing…" : "Import & start follow-up"}
    </button>
  );
}

const SAMPLE = `name,phone,email,interest,submitted
Dana Whitaker,612-555-0134,dana@example.com,Kids BJJ for my 8 year old,2026-02-11
Marcus Cole,(763) 555-0188,,Adult Muay Thai — asked about pricing,2026-01-04`;

export default function ImportLeadsForm({
  sequences,
}: {
  sequences: { key: string; name: string }[];
}) {
  const [state, formAction] = useFormState<FormState, FormData>(importLeadsAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="csv" className="mb-1 block text-sm font-medium">
          Paste CSV
        </label>
        <textarea
          id="csv"
          name="csv"
          rows={10}
          required
          placeholder={SAMPLE}
          className="field-input font-mono"
        />
        <p className="mt-1 text-sm text-slate-500">
          Recognized columns: name, phone, email, interest, notes, campaign, form, child name, age,
          submitted. Anything else is kept as an intake answer for the bot to read. Leads already in
          the system are refreshed rather than duplicated.
        </p>
      </div>

      <div>
        <label htmlFor="sequenceKey" className="mb-1 block text-sm font-medium">
          Follow-up cadence
        </label>
        <select
          id="sequenceKey"
          name="sequenceKey"
          defaultValue="REACTIVATION"
          className="field-input"
        >
          {sequences.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.message}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  );
}
