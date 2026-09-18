"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { coachQuickAdd } from "@/lib/actions";

type Member = { id: string; name: string; isChild: boolean };

export default function QuickAddMember({
  sessionId,
  members,
}: {
  sessionId: string;
  members: Member[];
}) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return members.slice(0, 5);
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [q, members]);

  function run(member: Member, checkIn: boolean) {
    setPendingKey(`${member.id}:${checkIn ? "in" : "add"}`);
    startTransition(async () => {
      const result = await coachQuickAdd(sessionId, member.id, checkIn);
      if (result.ok) {
        setMessage({ kind: "success", text: result.message });
        setQuery("");
        inputRef.current?.focus();
        router.refresh();
      } else {
        setMessage({ kind: "error", text: result.error });
      }
      setPendingKey(null);
    });
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <label htmlFor="quick-add-search" className="mb-1 block text-sm font-medium">
        Search members
      </label>
      <input
        ref={inputRef}
        id="quick-add-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing a name…"
        autoComplete="off"
        className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
      />
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${
            message.kind === "error"
              ? "border border-red-200 bg-red-50 text-red-700"
              : "border border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {message.text}
        </p>
      )}
      {results.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">
          {members.length === 0
            ? "Everyone eligible is already on the roster."
            : "No members match your search."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-stone-100" data-testid="quick-add-results">
          {results.map((m) => {
            const busy = pendingKey !== null && pendingKey.startsWith(`${m.id}:`);
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <p className="min-w-0 truncate text-sm font-medium">
                  {m.name}
                  {m.isChild && (
                    <span className="ml-1.5 text-xs font-normal text-stone-500">(youth)</span>
                  )}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(m, true)}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {pendingKey === `${m.id}:in` ? "Checking in…" : "Check in"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(m, false)}
                    className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-60"
                  >
                    {pendingKey === `${m.id}:add` ? "Adding…" : "Add"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!q && members.length > results.length && (
        <p className="mt-2 text-xs text-stone-500">
          Showing the {results.length} most frequent attendees — type to search all{" "}
          {members.length}.
        </p>
      )}
    </div>
  );
}
