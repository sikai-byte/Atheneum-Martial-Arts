import "./env-setup";
import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PASSWORD, db, login } from "./helpers";

/** Creates a two-parent household with two child profiles (no birthdays yet). */
async function createFamily(slug: string) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const household = await db.household.create({ data: { name: `${slug} Household` } });
  const parentA = await db.user.create({
    data: {
      email: `${slug}-a@test.local`,
      passwordHash,
      name: `${slug} Parent A`,
      role: "PARENT",
      householdId: household.id,
    },
  });
  const parentB = await db.user.create({
    data: {
      email: `${slug}-b@test.local`,
      passwordHash,
      name: `${slug} Parent B`,
      role: "PARENT",
      householdId: household.id,
    },
  });
  const kid1 = await db.memberProfile.create({
    data: { name: `${slug} Kid One`, isChild: true, householdId: household.id },
  });
  const kid2 = await db.memberProfile.create({
    data: { name: `${slug} Kid Two`, isChild: true, householdId: household.id },
  });
  return { household, parentA, parentB, kid1, kid2 };
}

test.describe("required child birthdays", () => {
  test("parent is gated until all child birthdays are saved, then age shows on account", async ({
    page,
  }) => {
    const { kid1, kid2 } = await createFamily("gate");

    await login(page, "gate-a@test.local");
    await expect(page).toHaveURL(/\/household\/birthdays/);

    // Other pages stay gated too.
    await page.goto("/schedule");
    await expect(page).toHaveURL(/\/household\/birthdays/);

    await page.fill(`input[name="birthdate-${kid1.id}"]`, "2014-03-14");
    await page.fill(`input[name="birthdate-${kid2.id}"]`, "2018-06-02");
    await page.getByRole("button", { name: /Save birthdays/ }).click();
    await expect(page).toHaveURL(/\/$/);

    const saved1 = await db.memberProfile.findUniqueOrThrow({ where: { id: kid1.id } });
    expect(saved1.birthDate?.toISOString().slice(0, 10)).toBe("2014-03-14");
    expect(saved1.birthYear).toBe(2014);

    // Age is derived from the birthday on the account page.
    const expectedAge = (dob: string) => {
      const b = new Date(`${dob}T00:00:00.000Z`);
      const now = new Date();
      let age = now.getUTCFullYear() - b.getUTCFullYear();
      const passed =
        now.getUTCMonth() > b.getUTCMonth() ||
        (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() >= b.getUTCDate());
      if (!passed) age -= 1;
      return age;
    };
    await page.goto("/account");
    await expect(
      page.getByText(new RegExp(`age ${expectedAge("2014-03-14")}`)).first()
    ).toBeVisible();
  });

  test("second parent in the household is no longer gated once birthdays are set", async ({
    page,
  }) => {
    const { kid1, kid2 } = await createFamily("shared");
    await db.memberProfile.update({
      where: { id: kid1.id },
      data: { birthDate: new Date("2013-01-20T00:00:00.000Z") },
    });
    await db.memberProfile.update({
      where: { id: kid2.id },
      data: { birthDate: new Date("2017-11-05T00:00:00.000Z") },
    });

    await login(page, "shared-b@test.local");
    await expect(page).toHaveURL(/\/$/);

    // Both parents see the same kids on their account page.
    await page.goto("/account");
    await expect(page.getByText("shared Kid One").first()).toBeVisible();
    await expect(page.getByText("shared Kid Two").first()).toBeVisible();
  });

  test("adults and members without kids are never gated", async ({ page }) => {
    await login(page, "member@example.com");
    await expect(page).toHaveURL(/\/$/);
  });
});
