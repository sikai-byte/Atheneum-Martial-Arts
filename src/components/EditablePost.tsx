"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { updatePost, type PostFormState } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import Linkify from "@/components/Linkify";

type Props = {
  postId: string;
  title: string;
  body: string;
  category: string;
  canEdit: boolean;
  editedLabel: string | null;
};

export default function EditablePost({ postId, title, body, category, canEdit, editedLabel }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState<PostFormState, FormData>(
    updatePost.bind(null, postId),
    {}
  );

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <div className="min-w-0">
        {title && <p className="mt-2 font-semibold">{title}</p>}
        <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
          <Linkify text={body} />
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-stone-400">
          {editedLabel && <span>{editedLabel}</span>}
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="hover:text-brand"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-3">
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="title"
          defaultValue={title}
          maxLength={120}
          placeholder="Title (optional)"
          aria-label="Title"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <select
          name="category"
          defaultValue={category}
          aria-label="Category"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="GENERAL">General</option>
          <option value="QUESTION">Question</option>
          <option value="NEWS">News</option>
        </select>
      </div>
      <textarea
        name="body"
        defaultValue={body}
        required
        rows={5}
        maxLength={4000}
        aria-label="Message"
        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Save changes
        </SubmitButton>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
