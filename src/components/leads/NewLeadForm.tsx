"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createLeadAction, type FormState } from "@/lib/leadActions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Starting follow-up…" : "Save & start follow-up"}
    </button>
  );
}

const inputClass = "w-full rounded-lg border border-stone-300 px-3 py-2";

export default function NewLeadForm({ sequences }: { sequences: { key: string; name: string }[] }) {
  const [state, formAction] = useFormState<FormState, FormData>(createLeadAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fullName" className="mb-1 block text-sm font-medium">
            Name
          </label>
          <input id="fullName" name="fullName" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium">
            Mobile number
          </label>
          <input
            id="phone"
            name="phone"
            required
            inputMode="tel"
            placeholder="(612) 555-0134"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email <span className="text-stone-500">(optional)</span>
          </label>
          <input id="email" name="email" type="email" className={inputClass} />
        </div>
        <div>
          <label htmlFor="ageGroup" className="mb-1 block text-sm font-medium">
            Who is it for?
          </label>
          <select id="ageGroup" name="ageGroup" defaultValue="UNKNOWN" className={inputClass}>
            <option value="UNKNOWN">Not sure yet</option>
            <option value="ADULT">Themselves (adult)</option>
            <option value="KID">Their child</option>
          </select>
        </div>
        <div>
          <label htmlFor="childName" className="mb-1 block text-sm font-medium">
            Child&apos;s name <span className="text-stone-500">(optional)</span>
          </label>
          <input id="childName" name="childName" className={inputClass} />
        </div>
        <div>
          <label htmlFor="source" className="mb-1 block text-sm font-medium">
            Where did they come from?
          </label>
          <select id="source" name="source" defaultValue="MANUAL" className={inputClass}>
            <option value="MANUAL">Walk-in / phone / referral</option>
            <option value="FACEBOOK_ADS">Facebook ad</option>
            <option value="WEBSITE">Website</option>
            <option value="IMPORT">Old list</option>
          </select>
        </div>
        <div>
          <label htmlFor="interest" className="mb-1 block text-sm font-medium">
            What are they after?
          </label>
          <input
            id="interest"
            name="interest"
            placeholder="Kids BJJ for a 7-year-old, weeknights"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="submittedAt" className="mb-1 block text-sm font-medium">
            Date they enquired <span className="text-stone-500">(blank = now)</span>
          </label>
          <input id="submittedAt" name="submittedAt" type="date" className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium">
          Notes for the bot
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Anything they told you — schedule constraints, budget worries, who referred them."
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="sequenceKey" className="mb-1 block text-sm font-medium">
          Follow-up cadence
        </label>
        <select id="sequenceKey" name="sequenceKey" defaultValue="" className={inputClass}>
          <option value="">Pick automatically by lead age</option>
          {sequences.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  );
}
