"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={ariaLabel}
      className={`${className ?? ""} inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-wait disabled:opacity-70`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {pending ? pendingLabel : children}
    </button>
  );
}
