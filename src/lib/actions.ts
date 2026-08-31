"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSession } from "./session";
import { requireCoach, requireUser } from "./auth";

export type LoginState = { error?: string };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "That email and password combination doesn't match our records." };
  }
  const session = await getSession();
  session.userId = user.id;
  await session.save();
  redirect(user.role === "COACH" || user.role === "ADMIN" ? "/coach" : "/");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

async function assertProfileInHousehold(userId: string, profileId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { household: { include: { profiles: true } }, profile: true },
  });
  const allowed =
    user.profile?.id === profileId ||
    user.household?.profiles.some((p) => p.id === profileId);
  if (!allowed) throw new Error("You can only manage bookings for your own household.");
}

export async function bookClass(profileId: string, sessionId: string) {
  const user = await requireUser();
  await assertProfileInHousehold(user.id, profileId);

  const classSession = await prisma.classSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { template: true, bookings: { where: { status: "BOOKED" } } },
  });
  if (classSession.status === "CANCELLED") throw new Error("This class has been cancelled.");
  if (classSession.startsAt < new Date()) throw new Error("This class has already started.");

  const isFull = classSession.bookings.length >= classSession.template.capacity;
  const status = isFull ? "WAITLISTED" : "BOOKED";

  await prisma.booking.upsert({
    where: { profileId_sessionId: { profileId, sessionId } },
    update: { status },
    create: { profileId, sessionId, status },
  });

  revalidatePath("/");
  revalidatePath("/schedule");
}

export async function cancelBooking(profileId: string, sessionId: string) {
  const user = await requireUser();
  await assertProfileInHousehold(user.id, profileId);

  await prisma.booking.update({
    where: { profileId_sessionId: { profileId, sessionId } },
    data: { status: "CANCELLED" },
  });

  // Promote the first waitlisted member, if any.
  const classSession = await prisma.classSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { template: true, bookings: true },
  });
  const bookedCount = classSession.bookings.filter((b) => b.status === "BOOKED").length;
  if (bookedCount < classSession.template.capacity) {
    const nextInLine = classSession.bookings
      .filter((b) => b.status === "WAITLISTED")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (nextInLine) {
      await prisma.booking.update({ where: { id: nextInLine.id }, data: { status: "BOOKED" } });
    }
  }

  revalidatePath("/");
  revalidatePath("/schedule");
}

export async function toggleAttendance(profileId: string, sessionId: string) {
  const coach = await requireCoach();
  const existing = await prisma.attendance.findUnique({
    where: { profileId_sessionId: { profileId, sessionId } },
  });
  const profile = await prisma.memberProfile.findUniqueOrThrow({ where: { id: profileId } });
  const isPunchPass = profile.membershipType === "PUNCH_PASS";
  if (existing) {
    await prisma.attendance.delete({ where: { id: existing.id } });
    if (isPunchPass && profile.punchPassUsed > 0) {
      await prisma.memberProfile.update({
        where: { id: profileId },
        data: { punchPassUsed: { decrement: 1 } },
      });
    }
  } else {
    await prisma.attendance.create({
      data: { profileId, sessionId, recordedBy: coach.name },
    });
    if (isPunchPass) {
      await prisma.memberProfile.update({
        where: { id: profileId },
        data: { punchPassUsed: { increment: 1 } },
      });
    }
  }
  revalidatePath(`/coach/session/${sessionId}`);
  revalidatePath("/coach");
  revalidatePath("/progress");
  revalidatePath("/");
}
