"use client";

import { useState } from "react";

export default function Flash({ ok, error }: { ok?: string; error?: string }) {
  const [dismissed, setDismissed] = useState(false);
  const message = error ?? ok;
  if (!message || dismissed) return null;
  const isError = Boolean(error);
  return (
    <p
      role={isError ? "alert" : "status"}
      className={`mt-3 flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
        isError
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss message"
        className="shrink-0 font-semibold opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </p>
  );
}
