import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSession } from "./session";

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      profile: true,
      household: { include: { profiles: true } },
    },
  });
  if (user?.deactivatedAt) return null;
  return user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (childBirthdaysMissing(user)) redirect("/household/birthdays");
  return user;
}

/** Parents must record every child's date of birth before using the rest of the app. */
export function childBirthdaysMissing(user: CurrentUser): boolean {
  if (user.role !== "PARENT") return false;
  const profiles = user.household?.profiles ?? [];
  return profiles.some((p) => p.isChild && !p.deactivatedAt && !p.birthDate);
}

export async function requireCoach(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "COACH" && user.role !== "ADMIN") redirect("/");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export function householdProfiles(user: CurrentUser) {
  const profiles = user.household?.profiles ?? (user.profile ? [user.profile] : []);
  return profiles.filter((p) => !p.deactivatedAt);
}
