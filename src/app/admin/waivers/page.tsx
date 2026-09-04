import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatDay } from "@/lib/format";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  KIOSK: "Kiosk",
  ONLINE: "Online",
  ADMIN: "Recorded by staff",
};

export default async function WaiversPage() {
  await requireAdmin();

  const profiles = await prisma.memberProfile.findMany({
    include: { waiver: true, household: { include: { users: true } } },
    orderBy: { name: "asc" },
  });

  const signed = profiles.filter((p) => p.waiver);
  const unsigned = profiles.filter((p) => !p.waiver && !p.deactivatedAt);

  return (
    <div className="space-y-6">
      <section>
        <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-800">
          &larr; Back to Admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Waivers</h1>
        <p className="mt-1 text-stone-600">
          {signed.length} of {profiles.length} members have a signed waiver on file.
        </p>
      </section>

      {unsigned.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
          <h2 className="text-lg font-semibold text-amber-900">
            Missing waivers ({unsigned.length})
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            These members should sign before training — they can sign from My account, or you can
            record a paper waiver from their member page.
          </p>
          <ul className="mt-3 divide-y divide-amber-200/60">
            {unsigned.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {p.name}
                    {p.isChild && <span className="ml-1 text-xs text-stone-500">(child)</span>}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {p.household.users.map((u) => u.email).join(", ") || "No account email"}
                  </p>
                </div>
                <Link
                  href={`/admin/member/${p.id}`}
                  className="shrink-0 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Record waiver
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Signed waivers ({signed.length})</h2>
        {signed.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">No signed waivers yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {signed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    <Link href={`/admin/member/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                    {p.isChild && <span className="ml-1 text-xs text-stone-500">(child)</span>}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    Signed “{p.waiver!.signedName}”
                    {p.waiver!.guardianName ? ` by ${p.waiver!.guardianName} (guardian)` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-right text-xs text-stone-500">
                  {formatDay(p.waiver!.signedAt)}
                  <br />
                  {SOURCE_LABELS[p.waiver!.source] ?? p.waiver!.source} · v{p.waiver!.version}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
