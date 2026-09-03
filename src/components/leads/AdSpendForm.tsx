"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deleteAdSpendAction, saveAdSpendAction, type FormState } from "@/lib/analyticsActions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary btn-md"
    >
      {pending ? "Saving…" : "Record spend"}
    </button>
  );
}

export type SpendRow = {
  id: string;
  source: string;
  campaign: string | null;
  amount: string;
  period: string;
  note: string;
};

export default function AdSpendForm({
  rows,
  sources,
}: {
  rows: SpendRow[];
  sources: string[];
}) {
  const [state, formAction] = useFormState<FormState, FormData>(saveAdSpendAction, {});

  return (
    <div className="space-y-6">
      <form action={formAction} className="grid gap-3 card p-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium">Source</span>
          <input
            name="source"
            list="spend-sources"
            required
            placeholder="FACEBOOK_ADS"
            className="mt-1 field-input"
          />
          <datalist id="spend-sources">
            {sources.map((source) => (
              <option key={source} value={source} />
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="font-medium">Campaign</span>
          <input
            name="campaign"
            placeholder="Leave blank for all spend on this source"
            className="mt-1 field-input"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">Amount spent</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="450"
            className="mt-1 field-input"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">Note</span>
          <input
            name="note"
            placeholder="Optional"
            className="mt-1 field-input"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">Period start</span>
          <input
            type="date"
            name="periodStart"
            required
            className="mt-1 field-input"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">Period end</span>
          <input
            type="date"
            name="periodEnd"
            required
            className="mt-1 field-input"
          />
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Submit />
          {state.error && (
            <p role="alert" className="text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state.message && <p className="text-sm text-green-700">{state.message}</p>}
        </div>
      </form>

      <div className="overflow-x-auto card">
        <table className="w-full text-sm">
          <caption className="sr-only">Recorded ad spend</caption>
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <span className="font-medium">{row.source.toLowerCase().replace(/_/g, " ")}</span>
                  {row.campaign && <span className="text-slate-500"> · {row.campaign}</span>}
                </td>
                <td className="px-4 py-3">{row.period}</td>
                <td className="px-4 py-3 font-semibold">{row.amount}</td>
                <td className="px-4 py-3 text-slate-600">{row.note}</td>
                <td className="px-4 py-3 text-right">
                  <form action={deleteAdSpendAction.bind(null, row.id)}>
                    <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-700">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-slate-600">
                  No spend recorded yet, so cost per lead and cost per member stay blank.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
