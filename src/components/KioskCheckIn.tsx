"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { kioskCheckIn, KioskCheckInState } from "@/lib/kiosk-actions";

export type KioskRosterEntry = {
  profileId: string;
  displayName: string;
  checkedIn: boolean;
};

function PinSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-emerald-700 px-6 py-4 text-xl font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
    >
      {pending ? "Checking in…" : "Check in"}
    </button>
  );
}

export default function KioskCheckIn({
  sessionId,
  roster,
}: {
  sessionId: string;
  roster: KioskRosterEntry[];
}) {
  const [state, formAction] = useFormState<KioskCheckInState, FormData>(
    kioskCheckIn.bind(null, sessionId),
    {}
  );
  const [selected, setSelected] = useState<KioskRosterEntry | null>(null);
  const [walkIn, setWalkIn] = useState(false);

  if (state.success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-3xl">🥋</p>
        <p className="mt-2 text-2xl font-bold text-emerald-900">
          {state.success.alreadyCheckedIn
            ? `${state.success.name}, you're already checked in!`
            : `You're checked in, ${state.success.name.split(" ")[0]}!`}
        </p>
        <p className="mt-1 text-lg text-emerald-800">{state.success.className}</p>
        <a
          href={`/kiosk/${sessionId}`}
          className="mt-5 inline-block rounded-xl bg-emerald-700 px-6 py-3.5 text-lg font-semibold text-white hover:bg-emerald-800"
        >
          Done
        </a>
      </div>
    );
  }

  const showPinForm = selected !== null || walkIn;

  return (
    <div className="space-y-4">
      {!showPinForm && (
        <>
          <p className="text-lg font-medium">Tap your name to check in:</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {roster.map((r) => (
              <button
                key={r.profileId}
                type="button"
                disabled={r.checkedIn}
                onClick={() => setSelected(r)}
                className={`rounded-2xl border p-5 text-left text-lg font-semibold shadow-sm ${
                  r.checkedIn
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-stone-200 bg-white active:bg-stone-50"
                }`}
              >
                {r.checkedIn && <span className="mr-1.5 text-emerald-700">✓</span>}
                {r.displayName}
                {r.checkedIn && (
                  <span className="block text-sm font-normal text-emerald-700">Checked in</span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setWalkIn(true)}
            className="w-full rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-lg font-medium text-stone-700 active:bg-stone-100"
          >
            Not on the list? Check in by name
          </button>
        </>
      )}

      {showPinForm && (
        <form action={formAction} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          {selected ? (
            <>
              <input type="hidden" name="profileId" value={selected.profileId} />
              <p className="text-xl font-semibold">{selected.displayName}</p>
            </>
          ) : (
            <div>
              <label htmlFor="kiosk-name" className="mb-1 block text-lg font-medium">
                Your full name
              </label>
              <input
                id="kiosk-name"
                name="name"
                required
                autoComplete="off"
                placeholder="e.g. Jordan Lee"
                className="w-full rounded-xl border border-stone-300 px-4 py-3.5 text-lg"
              />
            </div>
          )}
          <div>
            <label htmlFor="kiosk-pin" className="mb-1 block text-lg font-medium">
              Your 4-digit PIN
            </label>
            <input
              id="kiosk-pin"
              name="pin"
              required
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="off"
              placeholder="••••"
              className="w-full rounded-xl border border-stone-300 px-4 py-3.5 text-center text-2xl tracking-[0.5em]"
            />
          </div>
          {state.error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
              {state.error}
            </p>
          )}
          <PinSubmit />
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setWalkIn(false);
            }}
            className="w-full rounded-xl border border-stone-300 px-6 py-3.5 text-lg text-stone-700 hover:bg-stone-50"
          >
            Back
          </button>
        </form>
      )}
    </div>
  );
}
