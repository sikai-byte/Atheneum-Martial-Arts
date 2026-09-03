"use client";

import { useFormState, useFormStatus } from "react-dom";
import { approveDraftAction, discardDraftAction, type FormState } from "@/lib/leadActions";

const ACTION_LABELS: Record<string, string> = {
  ANSWER: "Answering a question",
  BOOK: "Going for the booking",
  UPSELL: "Upsell",
  HANDOFF: "Wants a human",
};

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * The sales agent's proposed reply, shown in the thread where the coach can read it against the
 * conversation, edit it, and send — or bin it.
 */
export default function AgentDraft({
  leadId,
  messageId,
  body,
  action,
  reason,
  booksClass,
}: {
  leadId: string;
  messageId: string;
  body: string;
  action: string | null;
  reason: string | null;
  booksClass: string | null;
}) {
  const [state, formAction] = useFormState<FormState, FormData>(
    approveDraftAction.bind(null, leadId, messageId),
    {},
  );

  return (
    <div className="rounded-xl border border-dashed border-brand/50 bg-brand/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          Agent draft{action ? ` · ${ACTION_LABELS[action] ?? action}` : ""}
        </p>
        <form action={discardDraftAction.bind(null, leadId, messageId)}>
          <button type="submit" className="text-xs text-stone-500 underline hover:text-stone-700">
            Discard
          </button>
        </form>
      </div>
      {reason && <p className="mt-1 text-xs text-stone-600">{reason}</p>}
      {booksClass && (
        <p className="mt-1 text-xs font-medium text-brand">
          Sending this also books them into {booksClass}.
        </p>
      )}
      <form action={formAction} className="mt-2 space-y-2">
        <textarea
          name="body"
          rows={3}
          required
          defaultValue={body}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <Submit label="Approve & send" pendingLabel="Sending…" />
          {state.error && (
            <p role="alert" className="text-sm text-red-700">
              {state.error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
