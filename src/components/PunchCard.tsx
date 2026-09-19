"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type Props = {
  name: string;
  plan: string;
  total: number;
  used: number;
};

function Stamp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export default function PunchCard({ name, plan, total, used }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  const remaining = Math.max(total - used, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 text-brand" aria-hidden="true">
          <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
          <circle cx="8" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="16" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
        View punch card
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${name} punch card`}
          onClick={close}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-stone-200 bg-gradient-to-br from-white via-white to-brand-light p-7 text-stone-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="Atheneum Martial Arts" width={56} height={57} />
                <div>
                  <p className="text-lg font-bold uppercase tracking-[0.2em] text-brand">
                    Atheneum
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-stone-500">
                    Martial Arts
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close punch card"
                className="-mr-2 -mt-2 rounded-full p-2 text-stone-500 hover:text-stone-700"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-6">
              <p className="text-base font-semibold">{name}</p>
              <p className="text-sm text-stone-500">{plan}</p>
            </div>

            <div className="mt-6 grid grid-cols-5 gap-3" data-testid="punch-grid">
              {Array.from({ length: total }, (_, i) => {
                const punched = i < used;
                return (
                  <div
                    key={i}
                    data-testid={punched ? "punch-used" : "punch-left"}
                    className={
                      punched
                        ? "flex aspect-square items-center justify-center rounded-full bg-brand text-white shadow"
                        : "flex aspect-square items-center justify-center rounded-full border-2 border-dashed border-stone-300 bg-white/60 text-xs font-medium text-stone-500"
                    }
                    style={punched ? { transform: `rotate(${((i * 7) % 15) - 7}deg)` } : undefined}
                  >
                    {punched ? <Stamp /> : i + 1}
                  </div>
                );
              })}
            </div>

            <div className="mt-7 flex items-end justify-between border-t border-stone-200 pt-4">
              <p className="text-3xl font-bold text-brand">
                {remaining}
                <span className="ml-1.5 text-sm font-medium text-stone-500">
                  {remaining === 1 ? "class" : "classes"} left
                </span>
              </p>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">
                One punch per check-in
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
