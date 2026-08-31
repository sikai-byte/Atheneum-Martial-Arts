import { prisma } from "@/lib/db";
import { requireCoach } from "@/lib/auth";
import { formatDay, formatPrice } from "@/lib/format";
import { updateOrderStatus } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function CoachOrdersPage() {
  await requireCoach();

  const orders = await prisma.order.findMany({
    where: { status: { in: ["PLACED", "READY"] } },
    include: { product: true, user: true },
    orderBy: { createdAt: "asc" },
  });

  const recent = await prisma.order.findMany({
    where: { status: { in: ["PICKED_UP", "CANCELLED"] } },
    include: { product: true, user: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const renderOrder = (o: (typeof orders)[number], open: boolean) => (
    <li key={o.id} className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {o.product.name}
            {o.size && ` · ${o.size}`}
            {o.quantity > 1 && ` · ×${o.quantity}`}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {o.user.name} · {formatDay(o.createdAt)} · {formatPrice(o.priceCents * o.quantity)}
          </p>
        </div>
        {open ? (
          <div className="flex items-center gap-2">
            {o.status === "PLACED" ? (
              <form action={updateOrderStatus.bind(null, o.id, "READY")}>
                <button
                  type="submit"
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Mark ready
                </button>
              </form>
            ) : (
              <form action={updateOrderStatus.bind(null, o.id, "PICKED_UP")}>
                <button
                  type="submit"
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Picked up &amp; paid
                </button>
              </form>
            )}
            <form action={updateOrderStatus.bind(null, o.id, "CANCELLED")}>
              <button
                type="submit"
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
            </form>
          </div>
        ) : (
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
            {o.status === "PICKED_UP" ? "Picked up" : "Cancelled"}
          </span>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Shop Orders</h1>
        <p className="mt-1 text-stone-600">
          Collect payment at the front desk when members pick up their gear.
        </p>
      </section>

      <section aria-labelledby="open-orders">
        <h2 id="open-orders" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Open orders ({orders.length})
        </h2>
        {orders.length === 0 ? (
          <p className="mt-2 rounded-xl border border-stone-200 bg-white p-4 text-stone-600">
            No open orders right now.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">{orders.map((o) => renderOrder(o, true))}</ul>
        )}
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-orders">
          <h2 id="recent-orders" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Recently completed
          </h2>
          <ul className="mt-2 space-y-2">{recent.map((o) => renderOrder(o, false))}</ul>
        </section>
      )}
    </div>
  );
}
