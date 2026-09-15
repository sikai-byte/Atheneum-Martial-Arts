"use client";

import { useMemo, useState } from "react";

type Member = { id: string; name: string; isChild: boolean };

export default function MemberSelect({
  id,
  label,
  members,
}: {
  id: string;
  label: string;
  members: Member[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [query, members]);

  return (
    <div className="min-w-52 flex-1">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search members…"
        aria-label={`Search: ${label}`}
        className="mb-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      <select
        id={id}
        name="profileId"
        required
        className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
      >
        <option value="">
          {filtered.length === 0 ? "No members match your search" : "Pick a member…"}
        </option>
        {filtered.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.isChild ? " (youth)" : ""}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-stone-500">Most frequent attendees are listed first.</p>
    </div>
  );
}
