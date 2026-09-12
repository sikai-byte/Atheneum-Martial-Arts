import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { db, login } from "./helpers";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const uploadPath = (imageId: string) =>
  path.join(process.cwd(), "test-uploads", `product-image-${imageId}`);

test.describe("shop product photos", () => {
  test("admin can upload photos, change the cover, and remove one", async ({ page }) => {
    const product = await db.product.create({
      data: { name: "Photo Test Gi", category: "GI", priceCents: 9900, sortOrder: 99 },
    });

    await login(page, "admin@example.com");
    await page.goto("/admin/shop");

    const card = page.locator("article", { hasText: "Photo Test Gi" });
    await expect(card.getByText("Needs at least 1 photo")).toBeVisible();

    await card.locator('input[name="photo"]').setInputFiles({
      name: "gi-front.png",
      mimeType: "image/png",
      buffer: PNG_1PX,
    });
    await card.getByRole("button", { name: "Add photo" }).click();
    await expect(page.getByText(/Photo added to Photo Test Gi/i)).toBeVisible();

    await card.locator('input[name="photo"]').setInputFiles({
      name: "gi-back.png",
      mimeType: "image/png",
      buffer: PNG_1PX,
    });
    await card.getByRole("button", { name: "Add photo" }).click();
    await expect(card.getByText("Photos (2/5)")).toBeVisible();

    let images = await db.productImage.findMany({
      where: { productId: product.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(images).toHaveLength(2);
    for (const image of images) expect(fs.existsSync(uploadPath(image.id))).toBe(true);

    // Promote the second photo to cover — it becomes first in sort order.
    await card.getByRole("button", { name: "Make cover" }).click();
    await expect(page.getByText(/cover photo updated/i)).toBeVisible();
    const reordered = await db.productImage.findMany({
      where: { productId: product.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(reordered[0].id).toBe(images[1].id);

    // The member shop shows the cover image and the photo route serves it.
    const coverResponse = await page.request.get(`/api/product-photo/${reordered[0].id}`);
    expect(coverResponse.status()).toBe(200);
    expect(coverResponse.headers()["content-type"]).toBe("image/png");
    await page.goto("/shop");
    await expect(
      page.locator(`img[src="/api/product-photo/${reordered[0].id}"]`)
    ).toBeVisible();

    // Removing a photo deletes the row and the stored file.
    await page.goto("/admin/shop");
    await card.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText(/Photo removed from Photo Test Gi/i)).toBeVisible();
    images = await db.productImage.findMany({ where: { productId: product.id } });
    expect(images).toHaveLength(1);
    expect(fs.existsSync(uploadPath(reordered[0].id))).toBe(false);
  });

  test("a product with 5 photos no longer offers an upload control", async ({ page }) => {
    const product = await db.product.create({
      data: {
        name: "Full Gallery Gloves",
        category: "GLOVES",
        priceCents: 4900,
        sortOrder: 98,
        images: {
          create: [0, 1, 2, 3, 4].map((sortOrder) => ({ mimeType: "image/png", sortOrder })),
        },
      },
    });

    await login(page, "admin@example.com");
    await page.goto("/admin/shop");
    const card = page.locator("article", { hasText: "Full Gallery Gloves" });
    await expect(card.getByText("Photos (5/5)")).toBeVisible();
    await expect(card.getByRole("button", { name: "Add photo" })).toHaveCount(0);

    await db.productImage.deleteMany({ where: { productId: product.id } });
    await db.product.delete({ where: { id: product.id } });
  });

  test("product photos require a signed-in user", async ({ page }) => {
    const image = await db.productImage.findFirst();
    test.skip(!image, "no product image fixture available");
    const response = await page.request.get(`/api/product-photo/${image!.id}`);
    expect(response.status()).toBe(401);
  });
});
