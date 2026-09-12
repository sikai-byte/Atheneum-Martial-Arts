"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { kioskRegister, RegisterState } from "@/lib/kiosk-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Registering…" : "Agree & register"}
    </button>
  );
}

export default function RegisterForm({
  waiverTitle,
  waiverParagraphs,
}: {
  waiverTitle: string;
  waiverParagraphs: string[];
}) {
  const [state, formAction] = useFormState<RegisterState, FormData>(kioskRegister, {});
  const [kind, setKind] = useState<"ADULT" | "CHILD">("ADULT");

  if (state.success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-3xl">🎉</p>
        <p className="mt-2 text-2xl font-bold text-emerald-900">
          Welcome, {state.success.name.split(" ")[0]}!
        </p>
        <p className="mt-2 text-lg text-emerald-800">
          You&apos;re registered and your waiver is signed. Check your email for portal access — and
          you can check in to today&apos;s classes right away with your name and PIN.
        </p>
        <a
          href="/register"
          className="mt-5 inline-block rounded-xl border border-emerald-700 px-6 py-3 text-lg font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          Register another person
        </a>
      </div>
    );
  }

  const input =
    "w-full rounded-xl border border-stone-300 px-4 py-3 text-lg";

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {(["ADULT", "CHILD"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-xl border p-4 text-lg font-semibold ${
              kind === k
                ? "border-brand bg-brand/10 text-brand-dark"
                : "border-stone-300 bg-white text-stone-600"
            }`}
          >
            {k === "ADULT" ? "I'm signing up" : "Signing up my child"}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />

      <div>
        <label htmlFor="reg-name" className="mb-1 block text-lg font-medium">
          {kind === "CHILD" ? "Parent / guardian full name" : "Your full name"}
        </label>
        <input id="reg-name" name="name" required maxLength={80} autoComplete="name" className={input} />
      </div>

      {kind === "CHILD" && (
        <>
          <div>
            <label htmlFor="reg-child" className="mb-1 block text-lg font-medium">
              Child&apos;s full name
            </label>
            <input id="reg-child" name="childName" required maxLength={80} className={input} />
          </div>
          <div>
            <label htmlFor="reg-birthyear" className="mb-1 block text-lg font-medium">
              Child&apos;s birth year <span className="font-normal text-stone-500">(optional)</span>
            </label>
            <input
              id="reg-birthyear"
              name="birthYear"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="e.g. 2016"
              className={input}
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="reg-email" className="mb-1 block text-lg font-medium">
          Email
        </label>
        <input id="reg-email" name="email" type="email" required autoComplete="email" className={input} />
      </div>

      <div>
        <label htmlFor="reg-pin" className="mb-1 block text-lg font-medium">
          Choose a 4-digit check-in PIN
        </label>
        <input
          id="reg-pin"
          name="pin"
          required
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="off"
          placeholder="••••"
          className="w-full rounded-xl border border-stone-300 px-4 py-3 text-center text-2xl tracking-[0.5em]"
        />
        <p className="mt-1 text-sm text-stone-500">
          {kind === "CHILD"
            ? "Your child uses this PIN to check in on the kiosk."
            : "You'll use this PIN to check in on the kiosk."}
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="font-semibold">{waiverTitle}</p>
        <div className="mt-3 max-h-56 space-y-3 overflow-y-auto rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm text-stone-700">
          {waiverParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-3 text-base">
          <input type="checkbox" name="agree" required className="mt-1 h-5 w-5" />
          <span>
            I have read and agree to the waiver above
            {kind === "CHILD" && " on behalf of my child"}.
          </span>
        </label>
        <div className="mt-4">
          <label htmlFor="reg-signed" className="mb-1 block text-lg font-medium">
            Type your full name to sign
          </label>
          <input id="reg-signed" name="signedName" required maxLength={80} autoComplete="off" className={input} />
        </div>
      </div>

      {state.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{state.error}</p>
      )}

      <Submit />
    </form>
  );
}
