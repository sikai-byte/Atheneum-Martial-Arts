import Link from "next/link";
import AdSpendForm from "@/components/leads/AdSpendForm";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function AdSpendPage() {
  await requireCoach();
  const [spend, sources] = await Promise.all([
    prisma.adSpend.findMany({ orderBy: { periodStart: "desc" } }),
    prisma.lead.findMany({ distinct: ["source"], select: { source: true } }),
  ]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Ad spend</h1>
          <p className="mt-1 text-slate-600">
            What each source cost. No ad account is connected, so this is the one number the app
            can&apos;t work out for itself — without it, cost per member stays blank.
          </p>
        </div>
        <Link
          href="/coach/growth"
          className="btn btn-secondary btn-md"
        >
          Back to growth
        </Link>
      </section>

      <AdSpendForm
        sources={sources.map((s) => s.source)}
        rows={spend.map((row) => ({
          id: row.id,
          source: row.source,
          campaign: row.campaign,
          amount: formatPrice(row.amountCents),
          period: `${dateFormat.format(row.periodStart)} – ${dateFormat.format(row.periodEnd)}`,
          note: row.note,
        }))}
      />

      <p className="text-sm text-slate-500">
        Record spend in periods that match how you read the dashboard: a spend row is counted in
        full whenever its period overlaps the range you are viewing, so a month of spend seen
        through a 7-day window looks more expensive than it was.
      </p>
    </div>
  );
}
