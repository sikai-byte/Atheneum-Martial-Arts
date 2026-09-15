"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { createPost } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import {
  MAX_IMAGE_BYTES,
  MAX_POST_MEDIA,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  POST_IMAGE_TYPES,
  POST_VIDEO_TYPES,
} from "@/lib/media";

type Preview = { url: string; isVideo: boolean; name: string };

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable video"));
    };
    video.src = url;
  });
}

export default function NewPostForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);

  async function handleFilesChanged() {
    const input = inputRef.current;
    if (!input) return;
    const files = Array.from(input.files ?? []);
    setError("");
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPreviews([]);

    const fail = (message: string) => {
      setError(message);
      input.value = "";
    };

    if (files.length > MAX_POST_MEDIA) {
      return fail(`You can attach up to ${MAX_POST_MEDIA} photos/videos per post.`);
    }
    for (const file of files) {
      if (POST_IMAGE_TYPES.includes(file.type)) {
        if (file.size > MAX_IMAGE_BYTES) {
          return fail(`"${file.name}" is too large — photos must be under 8 MB.`);
        }
      } else if (POST_VIDEO_TYPES.includes(file.type)) {
        if (file.size > MAX_VIDEO_BYTES) {
          return fail(`"${file.name}" is too large — videos must be under 100 MB.`);
        }
        try {
          const duration = await videoDuration(file);
          if (duration > MAX_VIDEO_SECONDS + 0.5) {
            return fail(
              `"${file.name}" is ${Math.round(duration)}s — videos must be 1 minute or shorter.`
            );
          }
        } catch {
          return fail(`We couldn't read "${file.name}" — please try a different video.`);
        }
      } else {
        return fail("Please attach JPEG/PNG/WebP photos or MP4/MOV/WebM videos.");
      }
    }

    setPreviews(
      files.map((file) => ({
        url: URL.createObjectURL(file),
        isVideo: POST_VIDEO_TYPES.includes(file.type),
        name: file.name,
      }))
    );
  }

  return (
    <form action={createPost} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="post-title" className="mb-1 block text-sm font-medium">
            Title (optional)
          </label>
          <input
            id="post-title"
            name="title"
            maxLength={120}
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            placeholder="e.g. Great rolls this morning!"
          />
        </div>
        <div>
          <label htmlFor="post-category" className="mb-1 block text-sm font-medium">
            Category
          </label>
          <select
            id="post-category"
            name="category"
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          >
            <option value="GENERAL">General</option>
            <option value="QUESTION">Question</option>
            <option value="NEWS">News</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="post-body" className="mb-1 block text-sm font-medium">
          Message
        </label>
        <textarea
          id="post-body"
          name="body"
          required
          rows={3}
          maxLength={4000}
          className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          placeholder="Share something with the community…"
        />
      </div>
      <div>
        <label htmlFor="post-media" className="mb-1 block text-sm font-medium">
          Photos &amp; videos (optional — up to {MAX_POST_MEDIA}, videos max 1 minute)
        </label>
        <input
          ref={inputRef}
          id="post-media"
          name="media"
          type="file"
          multiple
          accept={[...POST_IMAGE_TYPES, ...POST_VIDEO_TYPES].join(",")}
          onChange={handleFilesChanged}
          className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-stone-700"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {previews.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {previews.map((p) =>
              p.isVideo ? (
                <video
                  key={p.url}
                  src={p.url}
                  muted
                  playsInline
                  className="h-20 w-20 rounded-lg border border-stone-200 object-cover"
                />
              ) : (
                <img
                  key={p.url}
                  src={p.url}
                  alt={p.name}
                  className="h-20 w-20 rounded-lg border border-stone-200 object-cover"
                />
              )
            )}
          </div>
        )}
      </div>
      <SubmitButton
        pendingLabel="Posting…"
        className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        Post to community
      </SubmitButton>
    </form>
  );
}
