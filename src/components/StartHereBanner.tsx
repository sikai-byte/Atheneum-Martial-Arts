import Link from "next/link";
import { dismissStartHere } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

export default function StartHereBanner() {
  return (
    <section className="rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-brand">New here? Start with the quick tour.</p>
          <p className="mt-0.5 text-sm text-stone-600">
            A 2-minute guide to everything the portal can do for you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/start-here"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Start here
          </Link>
          <form action={dismissStartHere}>
            <SubmitButton
              pendingLabel="…"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Dismiss
            </SubmitButton>
          </form>
        </div>
      </div>
    </section>
  );
}
