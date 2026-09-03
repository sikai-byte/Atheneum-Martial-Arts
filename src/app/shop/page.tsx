import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDay, formatPrice } from "@/lib/format";
import { placeOrder, cancelOrder } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  PLACED: "Order placed",
  READY: "Ready for pickup",
  PICKED_UP: "Picked up",
  CANCELLED: "Cancelled",
};

const statusStyles: Record<string, string> = {
  PLACED: "bg-stone-100 text-stone-700",
  READY: "bg-green-100 text-green-800",
  PICKED_UP: "bg-blue-100 text-blue-800",
  CANCELLED: "bg-stone-100 text-stone-400",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string };
}) {
  const user = await requireUser();

  const [products, orders] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { images: { orderBy: { sortOrder: "asc" } } },
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
        <h1 className="text-2xl font-bold tracking-tight">Team Shop</h1>
        <p className="mt-1 text-stone-600">
          Order Atheneum gear here — pay at the front desk when you pick it up.
        </p>
        {searchParams.success && (
          <p
            role="status"
            className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          >
            {searchParams.success}
          </p>
        )}
        {searchParams.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {searchParams.error}
          </p>
        )}
      </section>

      <section aria-labelledby="gear">
        <h2 id="gear" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Gear
        </h2>
        <div className="mt-2 space-y-3">
          {products.map((p) => {
            const sizes = p.sizes ? p.sizes.split(",") : [];
            const outOfStock = p.stockCount === 0;
            const lowStock = p.stockCount !== null && p.stockCount > 0 && p.stockCount <= 5;
            return (
              <div key={p.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  {p.images.length > 0 && (
                    <a
                      href={`/api/product-photo/${p.images[0].id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/product-photo/${p.images[0].id}`}
                        alt={p.name}
                        className="h-20 w-20 rounded-lg border border-stone-200 object-cover sm:h-24 sm:w-24"
                      />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{p.name}</p>
                      {outOfStock && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                          Out of stock
                        </span>
                      )}
                      {lowStock && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                          Only {p.stockCount} left
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="mt-1 text-sm text-stone-600">{p.description}</p>
                    )}
                    {p.images.length > 1 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {p.images.slice(1).map((image, i) => (
                          <a
                            key={image.id}
                            href={`/api/product-photo/${image.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/product-photo/${image.id}`}
                              alt={`${p.name} photo ${i + 2}`}
                              className="h-12 w-12 rounded-md border border-stone-200 object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="whitespace-nowrap font-semibold text-brand">
                    {formatPrice(p.priceCents)}
                  </p>
                </div>
                {outOfStock ? (
                  <p className="mt-3 text-sm text-stone-500">
                    Check back soon or ask at the front desk.
                  </p>
                ) : (
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
                      className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
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
                    className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        Qty {n}
                      </option>
                    ))}
                  </select>
                  <SubmitButton
                    pendingLabel="Placing order…"
                    className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Order
                  </SubmitButton>
                </form>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="my-orders">
        <h2 id="my-orders" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Your orders
        </h2>
        {orders.length === 0 ? (
          <p className="mt-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-stone-600">
            No orders yet. Anything you order shows up here.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {o.product.name}
                      {o.size && ` · ${o.size}`}
                      {o.quantity > 1 && ` · ×${o.quantity}`}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
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
                        <SubmitButton
                          pendingLabel="Cancelling…"
                          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
                        >
                          Cancel
                        </SubmitButton>
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
