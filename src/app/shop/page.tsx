import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDay, formatPrice } from "@/lib/format";
import { placeOrder, cancelOrder } from "@/lib/actions";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  PLACED: "Order placed",
  READY: "Ready for pickup",
  PICKED_UP: "Picked up",
  CANCELLED: "Cancelled",
};

const statusStyles: Record<string, string> = {
  PLACED: "bg-slate-100 text-slate-700",
  READY: "bg-green-100 text-green-800",
  PICKED_UP: "bg-blue-100 text-blue-800",
  CANCELLED: "bg-slate-100 text-slate-400",
};

export default async function ShopPage() {
  const user = await requireUser();

  const [products, orders] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.order.findMany({
      where: { userId: user.id },
      include: { product: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="page-title">Team Shop</h1>
        <p className="mt-1 text-slate-600">
          Order Atheneum gear here — pay at the front desk when you pick it up.
        </p>
      </section>

      <section aria-labelledby="gear">
        <h2 id="gear" className="eyebrow text-xs">
          Gear
        </h2>
        <div className="mt-2 space-y-3">
          {products.map((p) => {
            const sizes = p.sizes ? p.sizes.split(",") : [];
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    {p.description && (
                      <p className="mt-1 text-sm text-slate-600">{p.description}</p>
                    )}
                  </div>
                  <p className="whitespace-nowrap font-semibold text-brand">
                    {formatPrice(p.priceCents)}
                  </p>
                </div>
                <form
                  action={placeOrder.bind(null, p.id)}
                  className="mt-3 flex flex-wrap items-center gap-2"
                >
                  {sizes.length > 0 && (
                    <select
                      name="size"
                      required
                      defaultValue=""
                      aria-label={`${p.name} size`}
                      className="field-input w-auto px-2 py-1.5"
                    >
                      <option value="" disabled>
                        Size
                      </option>
                      {sizes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    name="quantity"
                    defaultValue="1"
                    aria-label={`${p.name} quantity`}
                    className="field-input w-auto px-2 py-1.5"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        Qty {n}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="btn btn-primary px-4 py-1.5"
                  >
                    Order
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="my-orders">
        <h2 id="my-orders" className="eyebrow text-xs">
          Your orders
        </h2>
        {orders.length === 0 ? (
          <p className="mt-2 card p-4 text-slate-600">
            No orders yet. Anything you order shows up here.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {o.product.name}
                      {o.size && ` · ${o.size}`}
                      {o.quantity > 1 && ` · ×${o.quantity}`}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDay(o.createdAt)} · {formatPrice(o.priceCents * o.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[o.status] ?? statusStyles.PLACED}`}
                    >
                      {statusLabels[o.status] ?? o.status}
                    </span>
                    {o.status === "PLACED" && (
                      <form action={cancelOrder.bind(null, o.id)}>
                        <button
                          type="submit"
                          className="btn btn-secondary btn-sm"
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
