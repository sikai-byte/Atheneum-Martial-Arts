"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { resetPassword, type ResetPasswordState } from "@/lib/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Updating…" : "Set new password"}
    </button>
  );
}

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [state, formAction] = useFormState<ResetPasswordState, FormData>(resetPassword, {});

  if (!token) {
    return (
      <div className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-red-700">
        This reset link is missing its token.{" "}
        <Link href="/forgot-password" className="font-medium underline">
          Request a new one
        </Link>
        .
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-lg border border-stone-300 px-3 py-3"
        />
        <p className="mt-1 text-xs text-stone-500">At least 8 characters.</p>
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

export default function ResetPasswordPage() {
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
        Set a new password
      </h1>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
