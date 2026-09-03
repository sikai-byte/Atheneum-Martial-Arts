"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  deleteKnowledgeAction,
  saveKnowledgeAction,
  type FormState,
} from "@/lib/leadActions";

export type KnowledgeRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  audience: string;
  program: string;
  active: boolean;
  verified: boolean;
};

const inputClass = "field-input";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary btn-md"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function ItemForm({
  item,
  categories,
  audiences,
  onDone,
}: {
  item?: KnowledgeRow;
  categories: readonly string[];
  audiences: readonly string[];
  onDone?: () => void;
}) {
  const [state, formAction] = useFormState<FormState, FormData>(saveKnowledgeAction, {});

  return (
    <form
      action={async (formData: FormData) => {
        await formAction(formData);
        onDone?.();
      }}
      className="space-y-3 rounded-lg border border-slate-200 p-3"
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Category</label>
          <select name="category" defaultValue={item?.category ?? "FAQ"} className={inputClass}>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Applies to</label>
          <select name="audience" defaultValue={item?.audience ?? "ALL"} className={inputClass}>
            {audiences.map((audience) => (
              <option key={audience} value={audience}>
                {audience === "ALL" ? "everyone" : audience.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Program (optional)</label>
          <input name="program" defaultValue={item?.program ?? ""} className={inputClass} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Title</label>
        <input name="title" required defaultValue={item?.title ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">What the agent may say</label>
        <textarea
          name="body"
          rows={4}
          required
          defaultValue={item?.body ?? ""}
          className={inputClass}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={item?.active ?? true} />
          In use
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="verified" defaultChecked={item?.verified ?? false} />
          Confirmed accurate
        </label>
      </div>
      <p className="text-xs text-slate-500">
        The agent can only state facts from items marked <em>confirmed accurate</em>. Anything
        unconfirmed is withheld and it hands off to a coach instead.
      </p>
      <div className="flex items-center gap-3">
        <Submit label={item ? "Save" : "Add"} />
        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.message && <p className="text-sm text-emerald-700">{state.message}</p>}
      </div>
    </form>
  );
}

export default function KnowledgeEditor({
  items,
  categories,
  audiences,
}: {
  items: KnowledgeRow[];
  categories: readonly string[];
  audiences: readonly string[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="btn btn-secondary btn-md"
        >
          {adding ? "Cancel" : "Add something the agent should know"}
        </button>
      </div>

      {adding && (
        <ItemForm categories={categories} audiences={audiences} onDone={() => setAdding(false)} />
      )}

      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-slate-200 p-3">
            {editing === item.id ? (
              <ItemForm
                item={item}
                categories={categories}
                audiences={audiences}
                onDone={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="eyebrow">
                      {item.category.toLowerCase()}
                      {item.program && ` · ${item.program}`}
                      {item.audience !== "ALL" && ` · ${item.audience.toLowerCase()}`}
                    </p>
                    <p className="font-medium">{item.title}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {!item.verified && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                        needs confirming
                      </span>
                    )}
                    {!item.active && <span className="text-slate-500">off</span>}
                    <button
                      type="button"
                      onClick={() => setEditing(item.id)}
                      className="text-brand underline"
                    >
                      Edit
                    </button>
                    <form action={deleteKnowledgeAction.bind(null, item.id)}>
                      <button type="submit" className="text-slate-500 underline">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.body}</p>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
