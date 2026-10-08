"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";

export type GalleryItem = { src: string; kind: "IMAGE" | "VIDEO"; alt: string };

export default function PostMediaGallery({ items }: { items: GalleryItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) => {
      setOpenIndex((i) => (i === null ? null : (i + delta + items.length) % items.length));
    },
    [items.length]
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openIndex, close, step]);

  const current = openIndex === null ? null : items[openIndex];

  return (
    <>
      <div className={`mt-3 grid gap-2 ${items.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {items.map((m, i) =>
          m.kind === "VIDEO" ? (
            <button
              key={m.src}
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label="Expand video"
              className="relative block w-full cursor-zoom-in"
            >
              <video
                src={m.src}
                playsInline
                muted
                preload="metadata"
                className={`pointer-events-none w-full rounded-lg bg-black ${
                  items.length === 1 ? "max-h-96" : "h-48 object-cover"
                }`}
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-6 w-6" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>
            </button>
          ) : (
            <button
              key={m.src}
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label="Expand photo"
              className="block w-full cursor-zoom-in"
            >
              <img
                src={m.src}
                alt={m.alt}
                className={`w-full rounded-lg object-cover ${items.length === 1 ? "max-h-96" : "h-48"}`}
              />
            </button>
          )
        )}
      </div>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded media"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white hover:bg-white/20"
          >
            &times;
          </button>
          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Previous"
                className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
              >
                &#8249;
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Next"
                className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
              >
                &#8250;
              </button>
            </>
          )}
          {current.kind === "VIDEO" ? (
            <video
              src={current.src}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={current.src}
              alt={current.alt}
              className="max-h-full max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {items.length > 1 && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
              {(openIndex ?? 0) + 1} / {items.length}
            </p>
          )}
        </div>
      )}
    </>
  );
}
