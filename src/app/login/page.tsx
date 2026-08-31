"use client";

import Image from "next/image";
import { useFormState, useFormStatus } from "react-dom";
import { login, type LoginState } from "@/lib/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
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
      <p className="mt-1 text-center text-stone-600">
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
            className="w-full rounded-lg border border-stone-300 px-3 py-3"
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
            className="w-full rounded-lg border border-stone-300 px-3 py-3"
          />
        </div>
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <SubmitButton />
      </form>
      <div className="mt-8 rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
        <p className="font-semibold text-stone-800">Sample accounts (password: atheneum123)</p>
        <ul className="mt-2 space-y-1">
          <li>member@example.com — adult member</li>
          <li>parent@example.com — parent with two kids</li>
          <li>coach@example.com — coach tools</li>
        </ul>
      </div>
    </div>
  );
}
