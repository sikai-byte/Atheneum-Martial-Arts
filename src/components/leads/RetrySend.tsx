"use client";

import { useState, useTransition } from "react";
import { retryMessageAction, type FormState } from "@/lib/leadActions";

/**
 * Sends a message the provider rejected, or one the send gate held, without the coach retyping it.
 * A held message is re-checked on retry rather than forced through, so this can't route around an
 * opt-out.
 */
export default function RetrySend({ leadId, messageId }: { leadId: string; messageId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await retryMessageAction(leadId, messageId));
          })
        }
        className="btn btn-danger px-2 py-1 text-xs"
      >
        {pending ? "Retrying…" : "Retry"}
      </button>
      {result.error && (
        <span role="alert" className="text-xs text-red-700">
          {result.error}
        </span>
      )}
      {result.message && <span className="text-xs text-green-700">{result.message}</span>}
    </div>
  );
}
