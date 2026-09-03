"use client";

import { useRef, useState, useTransition } from "react";
import { updateProfilePhoto } from "@/lib/actions";

async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 512;
    const scale = Math.min(max / bitmap.width, max / bitmap.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export default function ProfilePhotoUploader({
  profileId,
  name,
  photoUrl,
}: {
  profileId: string;
  name: string;
  photoUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function onFileChosen(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const blob = await shrinkPhoto(file);
        const formData = new FormData();
        formData.append("photo", blob, "photo.jpg");
        await updateProfilePhoto(profileId, formData);
      } catch {
        setError("Couldn't save that photo — please try another one.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        aria-label={`${photoUrl ? "Change" : "Add"} photo for ${name}`}
        title={photoUrl ? "Change photo" : "Add photo"}
        className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-brand-light disabled:opacity-60"
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-brand">
            {initials}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-center text-[9px] font-medium text-white opacity-0 group-hover:opacity-100">
          {pending ? "…" : "Edit"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFileChosen(e.target.files)}
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
