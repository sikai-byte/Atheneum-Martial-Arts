import Link from "next/link";
import NewLeadForm from "@/components/leads/NewLeadForm";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
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
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Add a lead</h1>
        <p className="mt-1 text-stone-600">
          The bot investigates the lead, drafts a personalized opener, and texts it immediately.
        </p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <NewLeadForm sequences={sequences} />
      </div>
    </div>
  );
}
