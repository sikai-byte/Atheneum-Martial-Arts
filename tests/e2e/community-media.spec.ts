import "./env-setup";
import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { db, login } from "./helpers";
import { videoDurationSeconds } from "../../src/lib/media";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const fixture = (name: string) => path.join(process.cwd(), "tests", "fixtures", name);

function pngFile(name: string) {
  return { name, mimeType: "image/png", buffer: PNG_1PX };
}

test.describe("community post media", () => {
  test("a post can carry multiple photos and a short video", async ({ page }) => {
    await login(page, "member@example.com");
    await page.goto("/community");

    await page.locator("#post-body").fill("Multi-media test post");
    await page.locator("#post-media").setInputFiles([
      pngFile("one.png"),
      pngFile("two.png"),
      pngFile("three.png"),
      {
        name: "clip.mp4",
        mimeType: "video/mp4",
        buffer: fs.readFileSync(fixture("video-2s.mp4")),
      },
    ]);
    await expect(page.locator('form p[role="alert"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Post to community" }).click();

    const card = page.locator("article", { hasText: "Multi-media test post" });
    await expect(card).toBeVisible();
    await expect(card.locator("img")).toHaveCount(3);
    await expect(card.locator("video")).toHaveCount(1);

    const post = await db.post.findFirstOrThrow({
      where: { body: "Multi-media test post" },
      include: { media: { orderBy: { position: "asc" } } },
    });
    expect(post.media).toHaveLength(4);
    expect(post.media.filter((m) => m.kind === "IMAGE")).toHaveLength(3);
    expect(post.media.filter((m) => m.kind === "VIDEO")).toHaveLength(1);

    const video = post.media.find((m) => m.kind === "VIDEO")!;
    const response = await page.request.get(`/api/post-media/${video.id}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("video/mp4");
  });

  test("clicking a photo expands it in a lightbox", async ({ page }) => {
    await login(page, "member@example.com");
    await page.goto("/community");

    const card = page.locator("article", { hasText: "Multi-media test post" }).first();
    await card.getByRole("button", { name: "Expand photo" }).first().click();

    const dialog = page.getByRole("dialog", { name: "Expanded media" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("img")).toBeVisible();
    await expect(dialog.getByText("1 / 4")).toBeVisible();

    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByText("2 / 4")).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("clicking a video expands it in a lightbox", async ({ page }) => {
    await login(page, "member@example.com");
    await page.goto("/community");

    const card = page.locator("article", { hasText: "Multi-media test post" }).first();
    await card.getByRole("button", { name: "Expand video" }).click();

    const dialog = page.getByRole("dialog", { name: "Expanded media" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("video")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("more than 5 attachments are rejected before posting", async ({ page }) => {
    await login(page, "member@example.com");
    await page.goto("/community");

    await page
      .locator("#post-media")
      .setInputFiles([1, 2, 3, 4, 5, 6].map((n) => pngFile(`img-${n}.png`)));
    await expect(page.getByText("You can attach up to 5 photos/videos per post.")).toBeVisible();
    const remaining = await page.locator("#post-media").inputValue();
    expect(remaining).toBe("");
  });

  test("a video longer than 1 minute is rejected before posting", async ({ page }) => {
    await login(page, "member@example.com");
    await page.goto("/community");

    await page.locator("#post-media").setInputFiles({
      name: "too-long.mp4",
      mimeType: "video/mp4",
      buffer: fs.readFileSync(fixture("video-65s.mp4")),
    });
    await expect(page.getByText(/videos must be 1 minute or shorter/i)).toBeVisible();
  });

  test("server-side duration parsing matches the fixtures", async () => {
    const short = videoDurationSeconds(fs.readFileSync(fixture("video-2s.mp4")));
    const long = videoDurationSeconds(fs.readFileSync(fixture("video-65s.mp4")));
    expect(short).not.toBeNull();
    expect(short!).toBeLessThan(60);
    expect(long!).toBeGreaterThan(60);
  });

  test("post media requires a signed-in user", async ({ page }) => {
    const media = await db.postMedia.findFirst();
    test.skip(!media, "no post media fixture available");
    await page.context().clearCookies();
    const response = await page.request.get(`/api/post-media/${media!.id}`);
    expect(response.status()).toBe(401);
  });
});
