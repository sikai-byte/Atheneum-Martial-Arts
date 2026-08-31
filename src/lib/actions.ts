"use server";

import fs from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSession } from "./session";
import { requireAdmin, requireCoach, requireUser } from "./auth";
import { ensureUploadsDir, uploadsDir } from "./uploads";

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
  redirect(user.role === "ADMIN" ? "/admin" : user.role === "COACH" ? "/coach" : "/");
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

export async function placeOrder(productId: string, formData: FormData) {
  const user = await requireUser();
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  if (!product.active) throw new Error("This item is not available right now.");

  const sizeOptions = product.sizes ? product.sizes.split(",") : [];
  const size = String(formData.get("size") ?? "");
  if (sizeOptions.length > 0 && !sizeOptions.includes(size)) {
    throw new Error("Please choose a size.");
  }
  const quantity = Math.min(Math.max(Number(formData.get("quantity") ?? 1) || 1, 1), 10);

  await prisma.order.create({
    data: {
      userId: user.id,
      productId: product.id,
      size: sizeOptions.length > 0 ? size : "",
      quantity,
      priceCents: product.priceCents,
    },
  });

  revalidatePath("/shop");
  revalidatePath("/coach/orders");
}

export async function cancelOrder(orderId: string) {
  const user = await requireUser();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.userId !== user.id) throw new Error("You can only cancel your own orders.");
  if (order.status !== "PLACED") throw new Error("This order can no longer be cancelled.");

  await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });

  revalidatePath("/shop");
  revalidatePath("/coach/orders");
}

export async function updateOrderStatus(orderId: string, status: string) {
  await requireCoach();
  if (!["PLACED", "READY", "PICKED_UP", "CANCELLED"].includes(status)) {
    throw new Error("Invalid order status.");
  }
  await prisma.order.update({ where: { id: orderId }, data: { status } });

  revalidatePath("/shop");
  revalidatePath("/coach/orders");
}

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function updateProfilePhoto(profileId: string, formData: FormData) {
  const user = await requireUser();
  await assertProfileInHousehold(user.id, profileId);

  const file = formData.get("photo");
  if (!(file instanceof Blob) || file.size === 0) throw new Error("Please choose a photo.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Photo is too large — please use one under 8 MB.");
  if (!PHOTO_TYPES.includes(file.type)) throw new Error("Please use a JPEG, PNG, or WebP photo.");

  await ensureUploadsDir();
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadsDir(), profileId), buffer);
  await prisma.memberProfile.update({
    where: { id: profileId },
    data: { photoType: file.type, photoUpdatedAt: new Date() },
  });

  revalidatePath("/");
  revalidatePath("/progress");
}

export async function postAnnouncement(formData: FormData) {
  const coach = await requireCoach();
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!title || !body) throw new Error("Please add a title and a message.");

  await prisma.announcement.create({ data: { title, body, author: coach.name } });

  revalidatePath("/coach");
  revalidatePath("/");
}

export async function deleteAnnouncement(announcementId: string) {
  await requireCoach();
  await prisma.announcement.delete({ where: { id: announcementId } });

  revalidatePath("/coach");
  revalidatePath("/");
}

export async function createMemberAccount(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "MEMBER");
  if (!name || !email.includes("@")) throw new Error("Please add a name and a valid email.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (!["MEMBER", "PARENT", "COACH", "ADMIN"].includes(role)) throw new Error("Invalid role.");
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new Error("An account with that email already exists.");
  }

  const household = await prisma.household.create({ data: { name: `${name} Household` } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name,
      role,
      householdId: household.id,
    },
  });
  await prisma.memberProfile.create({
    data: { name, userId: user.id, householdId: household.id },
  });

  revalidatePath("/admin");
}

export async function addChildProfile(householdId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const birthYear = Number(formData.get("birthYear") ?? 0) || null;
  if (!name) throw new Error("Please add the child's name.");
  await prisma.household.findUniqueOrThrow({ where: { id: householdId } });

  await prisma.memberProfile.create({
    data: { name, isChild: true, birthYear, householdId },
  });

  revalidatePath("/admin");
}

export async function updateMembership(profileId: string, formData: FormData) {
  await requireAdmin();
  const membershipPlan = String(formData.get("membershipPlan") ?? "").trim().slice(0, 80) || null;
  const membershipType = String(formData.get("membershipType") ?? "");
  if (!["", "MONTHLY", "PUNCH_PASS"].includes(membershipType)) {
    throw new Error("Invalid membership type.");
  }
  const renewsAtRaw = String(formData.get("membershipRenewsAt") ?? "");
  const membershipRenewsAt = renewsAtRaw ? new Date(`${renewsAtRaw}T00:00:00`) : null;
  const punchPassTotal = Number(formData.get("punchPassTotal") ?? 0) || null;
  const punchPassUsed = Math.max(Number(formData.get("punchPassUsed") ?? 0) || 0, 0);

  await prisma.memberProfile.update({
    where: { id: profileId },
    data: {
      membershipPlan,
      membershipType: membershipType || null,
      membershipRenewsAt: membershipType === "MONTHLY" ? membershipRenewsAt : null,
      punchPassTotal: membershipType === "PUNCH_PASS" ? punchPassTotal ?? 10 : null,
      punchPassUsed: membershipType === "PUNCH_PASS" ? punchPassUsed : 0,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin");
}

export async function resetMemberPassword(userId: string, formData: FormData) {
  await requireAdmin();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });

  revalidatePath("/admin");
}
