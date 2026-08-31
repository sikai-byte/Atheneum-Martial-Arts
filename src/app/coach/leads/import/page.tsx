import Link from "next/link";
import ImportLeadsForm from "@/components/leads/ImportLeadsForm";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ImportLeadsPage() {
  await requireCoach();
  const sequences = await prisma.sequence.findMany({
    where: { active: true },
    select: { key: true, name: true },
    orderBy: { key: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach/leads" className="text-sm text-brand hover:underline">
          ← Leads
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Import old leads</h1>
        <p className="mt-1 text-stone-600">
          Drop in an old Facebook export or spreadsheet. Each lead is investigated and put on the
          reactivation cadence, which opens with a &ldquo;we just opened new spots&rdquo; angle
          instead of pretending they enquired today.
        </p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <ImportLeadsForm sequences={sequences} />
      </div>
    </div>
  );
}
