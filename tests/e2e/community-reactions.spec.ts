import "./env-setup";
import { test, expect } from "@playwright/test";
import { db, login } from "./helpers";

test.describe("community posting feedback and reactions", () => {
  test("posting shows a confirmation and clears the composer", async ({ page }) => {
    await login(page, "member@example.com");
    await page.goto("/community");

    await page.locator("#post-title").fill("Confirmation test");
    await page.locator("#post-body").fill("Testing the post confirmation flow");
    await page.getByRole("button", { name: "Post to community" }).click();

    await expect(page.getByText("Your post is live — thanks for sharing with the tribe!")).toBeVisible();
    await expect(page.locator("#post-title")).toHaveValue("");
    await expect(page.locator("#post-body")).toHaveValue("");
    await expect(
      page.locator("article", { hasText: "Testing the post confirmation flow" })
    ).toBeVisible();
  });

  test("members can add and remove emoji reactions", async ({ page }) => {
    const author = await db.user.findUniqueOrThrow({ where: { email: "member@example.com" } });
    const post = await db.post.create({
      data: { body: "React to me please", authorId: author.id },
    });

    await login(page, "member@example.com");
    await page.goto("/community");

    const card = page.locator("article", { hasText: "React to me please" });
    const thumbsUp = card.getByRole("button", { name: "React with 👍" });
    await thumbsUp.click();
    await expect(thumbsUp).toHaveAttribute("aria-pressed", "true");
    await expect(thumbsUp).toContainText("1");

    let reactions = await db.postReaction.findMany({ where: { postId: post.id } });
    expect(reactions).toHaveLength(1);
    expect(reactions[0].emoji).toBe("👍");

    await thumbsUp.click();
    await expect(thumbsUp).toHaveAttribute("aria-pressed", "false");
    reactions = await db.postReaction.findMany({ where: { postId: post.id } });
    expect(reactions).toHaveLength(0);
  });

  test("recent posts appear on the member home page", async ({ page }) => {
    const author = await db.user.findUniqueOrThrow({ where: { email: "member@example.com" } });
    await db.post.create({
      data: { title: "Home feed test", body: "This should show on the home page", authorId: author.id },
    });

    await login(page, "member@example.com");
    await page.goto("/");

    const section = page.locator("section", {
      has: page.getByRole("heading", { name: "From the community" }),
    });
    await expect(section.getByText("Home feed test")).toBeVisible();
    await expect(section.getByRole("link", { name: "See all" })).toHaveAttribute(
      "href",
      "/community"
    );
  });
});
