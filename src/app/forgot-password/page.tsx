"use client";

import Image from "next/image";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { requestPasswordReset, type ForgotPasswordState } from "@/lib/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary w-full px-4 py-3 text-base font-semibold"
    >
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState<ForgotPasswordState, FormData>(
    requestPasswordReset,
    {}
  );

  return (
    <div className="mx-auto mt-6 max-w-md">
      <Image
        src="/logo.png"
        alt="Atheneum Martial Arts logo"
        width={96}
        height={98}
        priority
        className="mx-auto"
      />
      <h1 className="mt-3 text-center text-2xl font-bold tracking-tight text-brand">
        Forgot your password?
      </h1>
      <p className="mt-1 text-center text-slate-600">
        Enter your email and we&apos;ll send you a link to reset it.
      </p>
      {state.done ? (
        <div className="mt-6 rounded-lg bg-green-50 px-4 py-3 text-green-800">
          If an account exists for that email, a reset link is on its way. Check your inbox (and
          spam folder) — the link expires in 1 hour.
        </div>
      ) : (
        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="field-input py-3"
            />
          </div>
          {state.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          <SubmitButton />
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
