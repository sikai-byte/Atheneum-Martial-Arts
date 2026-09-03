"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { login, type LoginState } from "@/lib/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary w-full px-4 py-3 text-base font-semibold"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

function ResetNotice() {
  const wasReset = useSearchParams().get("reset") === "1";
  if (!wasReset) return null;
  return (
    <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-center text-sm text-green-800">
      Your password has been updated. Sign in with your new password.
    </p>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState<LoginState, FormData>(login, {});

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
        Atheneum Martial Arts
      </h1>
      <p className="mt-1 text-center text-slate-600">
        Sign in to book classes and track your training.
      </p>
      <div className="relative mt-5 overflow-hidden rounded-2xl shadow-sm">
        <Image
          src="/team-photo.jpg"
          alt="Atheneum Martial Arts team on the mats"
          width={1600}
          height={1067}
          priority
          className="h-44 w-full object-cover sm:h-52"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <p className="absolute bottom-3 left-4 right-4 text-sm font-semibold text-white drop-shadow">
          This is where you belong.
        </p>
      </div>
      <Suspense>
        <ResetNotice />
      </Suspense>
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
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="field-input py-3"
          />
        </div>
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <SubmitButton />
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="font-medium text-brand hover:underline">
            Forgot your password?
          </Link>
        </p>
      </form>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Sample accounts (password: atheneum123)</p>
        <ul className="mt-2 space-y-1">
          <li>member@example.com — adult member</li>
          <li>parent@example.com — parent with two kids</li>
          <li>coach@example.com — coach tools</li>
          <li>admin@example.com — admin &amp; member management</li>
        </ul>
      </div>
    </div>
  );
}
