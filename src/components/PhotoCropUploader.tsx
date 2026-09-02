"use client";

import { useEffect, useRef, useState, useTransition } from "react";

const FRAME = 288;
const OUTPUT = 512;
const MAX_ZOOM = 4;

type Loaded = {
  url: string;
  width: number;
  height: number;
};

export default function PhotoCropUploader({
  action,
  buttonLabel = "Upload photo",
}: {
  action: (formData: FormData) => Promise<void>;
  buttonLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (loaded) URL.revokeObjectURL(loaded.url);
    };
  }, [loaded]);

  const coverScale = loaded ? Math.max(FRAME / loaded.width, FRAME / loaded.height) : 1;
  const scale = coverScale * zoom;

  function clampOffset(x: number, y: number, z: number) {
    if (!loaded) return { x: 0, y: 0 };
    const s = coverScale * z;
    const minX = FRAME - loaded.width * s;
    const minY = FRAME - loaded.height * s;
    return {
      x: Math.min(0, Math.max(minX, x)),
      y: Math.min(0, Math.max(minY, y)),
    };
  }

  async function onFileChosen(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (loaded) URL.revokeObjectURL(loaded.url);
      const url = URL.createObjectURL(file);
      const next = { url, width: bitmap.width, height: bitmap.height };
      bitmap.close();
      setLoaded(next);
      setZoom(1);
      const s = Math.max(FRAME / next.width, FRAME / next.height);
      setOffset({
        x: (FRAME - next.width * s) / 2,
        y: (FRAME - next.height * s) / 2,
      });
    } catch {
      setError("Couldn't read that image — please try another one.");
    }
  }

  function onZoomChange(z: number) {
    const prevScale = scale;
    const nextScale = coverScale * z;
    const cx = FRAME / 2;
    const cy = FRAME / 2;
    const nx = cx - ((cx - offset.x) / prevScale) * nextScale;
    const ny = cy - ((cy - offset.y) / prevScale) * nextScale;
    setZoom(z);
    setOffset(clampOffset(nx, ny, z));
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setOffset(
      clampOffset(drag.originX + (e.clientX - drag.startX), drag.originY + (e.clientY - drag.startY), zoom)
    );
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  function cancel() {
    if (loaded) URL.revokeObjectURL(loaded.url);
    setLoaded(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function save() {
    const img = imgRef.current;
    if (!loaded || !img) return;
    setError(null);
    startTransition(async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT;
        canvas.height = OUTPUT;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        ctx.drawImage(img, -offset.x / scale, -offset.y / scale, FRAME / scale, FRAME / scale, 0, 0, OUTPUT, OUTPUT);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.88)
        );
        if (!blob) throw new Error("no blob");
        const formData = new FormData();
        formData.append("photo", blob, "photo.jpg");
        await action(formData);
        cancel();
      } catch {
        setError("Couldn't save that photo — please try again.");
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="max-w-52 text-xs"
          onChange={(e) => onFileChosen(e.target.files)}
        />
        {!loaded && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
          >
            {buttonLabel}
          </button>
        )}
      </div>
      {loaded && (
        <div className="mt-3 space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs text-stone-500">
            Drag the photo to position it, and zoom until it fills the circle.
          </p>
          <div
            className="relative touch-none overflow-hidden rounded-full border border-stone-300 bg-stone-200"
            style={{ width: FRAME, height: FRAME, cursor: "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={loaded.url}
              alt="Photo to crop"
              draggable={false}
              className="pointer-events-none max-w-none select-none"
              style={{
                width: loaded.width * scale,
                height: loaded.height * scale,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-stone-600">
            Zoom
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              className="flex-1"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save photo"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
