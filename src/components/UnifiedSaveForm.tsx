"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function UnifiedSaveForm({
  formId,
  action,
  children,
}: {
  formId: string;
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  const markDirty = useCallback(
    (e: React.FormEvent) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (target.form?.id !== formId) return;
      dirtyRef.current = true;
      setDirty(true);
    },
    [formId]
  );

  const handleSubmit = useCallback(() => {
    dirtyRef.current = false;
    setDirty(false);
    setSaving(true);
  }, []);

  const wrappedAction = useCallback(
    async (formData: FormData) => {
      try {
        await action(formData);
      } finally {
        setSaving(false);
      }
    },
    [action]
  );

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const handleClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const anchor = (e.target as HTMLElement).closest?.("a[href]");
      if (!anchor) return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  const bar = (topButton: boolean) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <p className={`text-sm ${dirty ? "font-medium text-amber-700" : "text-stone-500"}`}>
        {saving ? "Saving…" : dirty ? "You have unsaved changes." : "No unsaved changes."}
      </p>
      <button
        type="submit"
        form={topButton ? undefined : formId}
        disabled={saving}
        className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );

  return (
    <div className="space-y-4" onInputCapture={markDirty} onChangeCapture={markDirty}>
      <form id={formId} action={wrappedAction} onSubmit={handleSubmit}>
        {bar(true)}
      </form>
      {children}
      {bar(false)}
    </div>
  );
}
