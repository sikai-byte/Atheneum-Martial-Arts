import { stopImpersonating } from "@/lib/actions";

export default function ImpersonationBanner({ name }: { name: string }) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
      <span>
        Viewing as <strong>{name}</strong> — this is exactly what they see.
      </span>
      <form action={stopImpersonating}>
        <button
          type="submit"
          className="whitespace-nowrap rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-900"
        >
          Return to admin
        </button>
      </form>
    </div>
  );
}
