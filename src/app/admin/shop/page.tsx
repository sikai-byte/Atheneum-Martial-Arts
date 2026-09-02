import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createProduct, updateProduct } from "@/lib/adminContent";
import Flash from "@/components/Flash";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const inputClass = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm";

const categories = [
  ["MOUTHGUARD", "Mouthguard"],
  ["RASHGUARD", "Rashguard"],
  ["TSHIRT", "T-shirt"],
  ["SHORTS", "Shorts"],
  ["GI", "Gi"],
  ["GLOVES", "Gloves"],
  ["SHINGUARDS", "Shin guards"],
  ["OTHER", "Other"],
] as const;

function ProductFields({
  product,
  idPrefix,
}: {
  product?: {
    name: string;
    description: string;
    category: string;
    priceCents: number;
    sizes: string;
    sortOrder: number;
  };
  idPrefix: string;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-name`} className="mb-1 block text-xs font-medium">
            Product name
          </label>
          <input
            id={`${idPrefix}-name`}
            name="name"
            required
            maxLength={120}
            defaultValue={product?.name ?? ""}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor={`${idPrefix}-category`} className="mb-1 block text-xs font-medium">
              Category
            </label>
            <select
              id={`${idPrefix}-category`}
              name="category"
              defaultValue={product?.category ?? "OTHER"}
              className={inputClass}
            >
              {categories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-price`} className="mb-1 block text-xs font-medium">
              Price ($)
            </label>
            <input
              id={`${idPrefix}-price`}
              name="price"
              type="number"
              min={0}
              max={10000}
              step="0.01"
              required
              defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-sort`} className="mb-1 block text-xs font-medium">
              Display order
            </label>
            <input
              id={`${idPrefix}-sort`}
              name="sortOrder"
              type="number"
              min={0}
              max={999}
              defaultValue={product?.sortOrder ?? 0}
              className={inputClass}
            />
          </div>
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-sizes`} className="mb-1 block text-xs font-medium">
          Sizes (comma-separated; leave blank for one-size)
        </label>
        <input
          id={`${idPrefix}-sizes`}
          name="sizes"
          maxLength={200}
          defaultValue={product?.sizes ?? ""}
          placeholder="e.g. S, M, L, XL"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-description`} className="mb-1 block text-xs font-medium">
          Description
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={product?.description ?? ""}
          className={inputClass}
        />
      </div>
    </>
  );
}

export default async function AdminShopPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string };
}) {
  await requireAdmin();
  const products = await prisma.product.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-8">
      <section>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          &larr; Back to Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Edit Shop Products</h1>
        <p className="mt-1 text-stone-600">
          Changes here update the Team Shop. Uncheck &quot;Show in shop&quot; to retire an item —
          past orders keep their original price.
        </p>
        <Flash ok={searchParams.ok} error={searchParams.error} />
      </section>

      <section className="space-y-4" aria-label="Products">
        {products.map((product) => (
          <article key={product.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{product.name}</h2>
              {!product.active && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                  Hidden from shop
                </span>
              )}
            </div>
            <form action={updateProduct.bind(null, product.id)} className="mt-3 space-y-3">
              <ProductFields product={product} idPrefix={`product-${product.id}`} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={product.active}
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  Show in shop
                </label>
                <SubmitButton className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                  Save changes
                </SubmitButton>
              </div>
            </form>
          </article>
        ))}
      </section>

      <section aria-labelledby="add-product">
        <h2
          id="add-product"
          className="text-sm font-semibold uppercase tracking-wide text-stone-500"
        >
          Add a product
        </h2>
        <form
          action={createProduct}
          className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <ProductFields idPrefix="new-product" />
          <SubmitButton
            pendingLabel="Adding…"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Add product
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
