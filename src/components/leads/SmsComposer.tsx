"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  sendLeadSmsAction,
  simulateInboundAction,
  type FormState,
} from "@/lib/leadActions";

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

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.message) return <p className="text-sm text-emerald-700">{state.message}</p>;
  return null;
}

export default function SmsComposer({
  leadId,
  suggestion,
  allowSimulatedReply,
  disabled,
}: {
  leadId: string;
  suggestion?: string;
  allowSimulatedReply: boolean;
  disabled?: boolean;
}) {
  const [sendState, sendFormAction] = useFormState<FormState, FormData>(
    sendLeadSmsAction.bind(null, leadId),
    {},
  );
  const [inboundState, inboundFormAction] = useFormState<FormState, FormData>(
    simulateInboundAction.bind(null, leadId),
    {},
  );

  if (disabled) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        This lead opted out of texts, so the studio can&apos;t message them.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form action={sendFormAction} className="space-y-2">
        <label htmlFor="body" className="block text-sm font-medium">
          Text this lead
        </label>
        <textarea
          id="body"
          name="body"
          rows={3}
          required
          defaultValue={suggestion}
          className="w-full rounded-lg border border-stone-300 px-3 py-2"
        />
        <div className="flex items-center gap-3">
          <Submit label="Send text" pendingLabel="Sending…" />
          <Feedback state={sendState} />
        </div>
      </form>

      {allowSimulatedReply && (
        <form
          action={inboundFormAction}
          className="space-y-2 rounded-lg border border-dashed border-stone-300 p-3"
        >
          <label htmlFor="inboundBody" className="block text-sm font-medium">
            Simulate a reply from the lead
          </label>
          <p className="text-xs text-stone-500">
            Twilio isn&apos;t connected yet. Use this to exercise reply handling: the drip pauses,
            the lead moves to <em>replied</em>, and the auto-acknowledgement goes out.
          </p>
          <input
            id="inboundBody"
            name="body"
            required
            placeholder="Yes! What times do you have Saturday?"
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          />
          <div className="flex items-center gap-3">
            <Submit label="Record reply" pendingLabel="Recording…" />
            <Feedback state={inboundState} />
          </div>
        </form>
      )}
    </div>
  );
}
