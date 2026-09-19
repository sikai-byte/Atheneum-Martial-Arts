import "./env-setup";
import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createMember, db, login, PASSWORD } from "./helpers";

async function makeSession(ageGroup: string, name: string) {
  const program = await db.program.upsert({
    where: { name: "Eligibility Test Program" },
    update: {},
    create: { name: "Eligibility Test Program", description: "test" },
  });
  const template = await db.classTemplate.create({
    data: { name, description: "test", programId: program.id, ageGroup },
  });
  return db.classSession.create({
    data: {
      templateId: template.id,
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      instructor: "Coach Test",
    },
  });
}

async function createParentWithKid(email: string, name: string, kidName: string) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const household = await db.household.create({ data: { name: `${name} Household` } });
  const user = await db.user.create({
    data: { email, passwordHash, name, role: "PARENT", householdId: household.id },
  });
  const parentProfile = await db.memberProfile.create({
    data: { name, userId: user.id, householdId: household.id },
  });
  const kidProfile = await db.memberProfile.create({
    data: {
      name: kidName,
      isChild: true,
      householdId: household.id,
      birthDate: new Date("2016-05-01"),
    },
  });
  return { user, parentProfile, kidProfile };
}

async function quickAddResults(page: import("@playwright/test").Page, query: string) {
  await page.getByLabel("Search members").fill(query);
  await page.waitForTimeout(150); // let the client-side filter re-render
  const items = await page.locator('[data-testid="quick-add-results"] li').allTextContents();
  return items.join("|");
}

test.describe("class eligibility rules", () => {
  test("kids class picker only offers youth members", async ({ page }) => {
    await createMember("elig-adult@test.local", "Elig Adult");
    await createParentWithKid("elig-parent@test.local", "Elig Parent", "Elig Kid");
    const session = await makeSession("KIDS", "Eligibility Kids Class");

    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${session.id}`);
    expect(await quickAddResults(page, "Elig Kid")).toContain("Elig Kid");
    expect(await quickAddResults(page, "Elig Adult")).not.toContain("Elig Adult");
    expect(await quickAddResults(page, "Elig Parent")).not.toContain("Elig Parent");
  });

  test("adult class picker excludes kids and non-member parents", async ({ page }) => {
    await createMember("elig-adult2@test.local", "Elig AdultTwo");
    await createParentWithKid("elig-parent2@test.local", "Elig ParentTwo", "Elig KidTwo");
    const session = await makeSession("ADULTS", "Eligibility Adults Class");

    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${session.id}`);
    expect(await quickAddResults(page, "Elig AdultTwo")).toContain("Elig AdultTwo");
    expect(await quickAddResults(page, "Elig KidTwo")).not.toContain("Elig KidTwo");
    expect(await quickAddResults(page, "Elig ParentTwo")).not.toContain("Elig ParentTwo");
    expect(await quickAddResults(page, "Coach Sam")).toContain("Coach Sam");
  });

  test("adult-program kid appears in both kids and adult class pickers", async ({ page }) => {
    const { kidProfile } = await createParentWithKid(
      "elig-parent4@test.local",
      "Elig ParentFour",
      "Elig KidFour"
    );
    await db.memberProfile.update({
      where: { id: kidProfile.id },
      data: { adultClassEligible: true },
    });
    const adultSession = await makeSession("ADULTS", "Eligibility Adults Class Four");
    const kidsSession = await makeSession("KIDS", "Eligibility Kids Class Four");

    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${adultSession.id}`);
    expect(await quickAddResults(page, "Elig KidFour")).toContain("Elig KidFour");

    await page.goto(`/coach/session/${kidsSession.id}`);
    expect(await quickAddResults(page, "Elig KidFour")).toContain("Elig KidFour");
  });

  test("picker search narrows the member list", async ({ page }) => {
    await createMember("elig-search1@test.local", "Searchable Alpha");
    await createMember("elig-search2@test.local", "Searchable Bravo");
    const session = await makeSession("ADULTS", "Eligibility Search Class");

    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${session.id}`);
    const results = await quickAddResults(page, "Searchable Alpha");
    expect(results).toContain("Searchable Alpha");
    expect(results).not.toContain("Searchable Bravo");
  });

  test("non-member parent has no booking control for themselves on adult classes", async ({
    page,
  }) => {
    await createParentWithKid("elig-parent3@test.local", "Elig ParentThree", "Elig KidThree");
    await makeSession("ADULTS", "Eligibility Adults Class Three");

    await login(page, "elig-parent3@test.local");
    await page.goto("/schedule?view=adults");
    const card = page.locator("article", { hasText: "Eligibility Adults Class Three" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: /Book|Join waitlist/ })).toHaveCount(0);
  });
});
