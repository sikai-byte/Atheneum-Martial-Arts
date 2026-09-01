"use server";

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSession } from "./session";
import { requireAdmin, requireCoach, requireUser } from "./auth";
import { ensureUploadsDir, uploadsDir } from "./uploads";
import { formatTime } from "./format";
import { bookingLimit } from "./capacity";
import { trialEndOfDay } from "./trial";
import { appUrl, sendPasswordResetEmail } from "./email";

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

export type ForgotPasswordState = { done?: boolean; error?: string };

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    try {
      await sendPasswordResetEmail(email, `${appUrl()}/reset-password?token=${token}`);
    } catch (err) {
      console.error("Password reset email failed:", err);
      return { error: "We couldn't send the email right now. Please try again in a few minutes." };
    }
  }

  // Same response whether or not the account exists.
  return { done: true };
}

export type ResetPasswordState = { error?: string };

export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired. Please request a new one." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect("/login?reset=1");
}

async function assertProfileInHousehold(userId: string, profileId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { household: { include: { profiles: true } }, profile: true },
  });
  const allowed =
    user.role === "ADMIN" ||
    user.profile?.id === profileId ||
    user.household?.profiles.some((p) => p.id === profileId);
  if (!allowed) throw new Error("You can only manage bookings for your own household.");
}

export async function bookClass(profileId: string, sessionId: string) {
  const user = await requireUser();
  await assertProfileInHousehold(user.id, profileId);

  await prisma.$transaction(async (tx) => {
    // Take the write lock up front so the capacity check serializes.
    await tx.$executeRaw`UPDATE ClassSession SET status = status WHERE id = ${sessionId}`;
    const classSession = await tx.classSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { template: true, bookings: { where: { status: "BOOKED" } } },
    });
    if (classSession.status === "CANCELLED") throw new Error("This class has been cancelled.");
    if (classSession.startsAt < new Date()) throw new Error("This class has already started.");

    const profile = await tx.memberProfile.findUniqueOrThrow({ where: { id: profileId } });
    if (profile.membershipType === "TRIAL") {
      const trialEnd = trialEndOfDay(profile.membershipRenewsAt);
      if (!trialEnd || classSession.startsAt > trialEnd || new Date() > trialEnd) {
        throw new Error(
          "That class is outside the trial period — see the front desk to start a membership."
        );
      }
    }

    const isFull = classSession.bookings.length >= bookingLimit(classSession.template.capacity);
    const status = isFull ? "WAITLISTED" : "BOOKED";

    await tx.booking.upsert({
      where: { profileId_sessionId: { profileId, sessionId } },
      update: { status },
      create: { profileId, sessionId, status },
    });
  });

  revalidatePath("/");
  revalidatePath("/schedule");
}

export async function cancelBooking(profileId: string, sessionId: string) {
  const user = await requireUser();
  await assertProfileInHousehold(user.id, profileId);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { profileId_sessionId: { profileId, sessionId } },
      data: { status: "CANCELLED" },
    });

    // Promote the first waitlisted member, if any.
    const classSession = await tx.classSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { template: true, bookings: true },
    });
    const bookedCount = classSession.bookings.filter((b) => b.status === "BOOKED").length;
    if (bookedCount < bookingLimit(classSession.template.capacity)) {
      const nextInLine = classSession.bookings
        .filter((b) => b.status === "WAITLISTED")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (nextInLine) {
        await tx.booking.update({ where: { id: nextInLine.id }, data: { status: "BOOKED" } });
      }
    }
  });

  revalidatePath("/");
  revalidatePath("/schedule");
}

export async function toggleAttendance(profileId: string, sessionId: string) {
  const coach = await requireCoach();
  await prisma.$transaction(async (tx) => {
    // Take the write lock up front so the punch-pass update serializes.
    await tx.$executeRaw`UPDATE MemberProfile SET id = id WHERE id = ${profileId}`;
    const existing = await tx.attendance.findUnique({
      where: { profileId_sessionId: { profileId, sessionId } },
    });
    const profile = await tx.memberProfile.findUniqueOrThrow({ where: { id: profileId } });
    const isPunchPass = profile.membershipType === "PUNCH_PASS";
    if (existing) {
      await tx.attendance.delete({ where: { id: existing.id } });
      if (isPunchPass && profile.punchPassUsed > 0) {
        await tx.memberProfile.update({
          where: { id: profileId },
          data: { punchPassUsed: { decrement: 1 } },
        });
      }
    } else {
      await tx.attendance.create({
        data: { profileId, sessionId, recordedBy: coach.name },
      });
      if (isPunchPass) {
        await tx.memberProfile.update({
          where: { id: profileId },
          data: { punchPassUsed: { increment: 1 } },
        });
      }
    }
  });
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

  const isTrial = formData.get("trial") === "on" && (role === "MEMBER" || role === "PARENT");
  const trialEndsRaw = String(formData.get("trialEndsAt") ?? "");
  const parsedTrialEnd = trialEndsRaw ? new Date(`${trialEndsRaw}T00:00:00`) : null;
  if (isTrial && parsedTrialEnd && Number.isNaN(parsedTrialEnd.getTime())) {
    throw new Error("Please enter the trial end date as YYYY-MM-DD.");
  }
  const trialEndsAt = parsedTrialEnd ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
  const profile = await prisma.memberProfile.create({
    data: {
      name,
      userId: user.id,
      householdId: household.id,
      ...(isTrial
        ? { membershipPlan: "Trial", membershipType: "TRIAL", membershipRenewsAt: trialEndsAt }
        : {}),
    },
  });

  revalidatePath("/admin");
  redirect(`/admin/member/${profile.id}`);
}

export async function adminBookClass(profileId: string, formData: FormData) {
  await requireAdmin();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Please pick a class.");
  await bookClass(profileId, sessionId);
  revalidatePath(`/admin/member/${profileId}`);
}

export async function adminCancelBooking(profileId: string, sessionId: string) {
  await requireAdmin();
  await cancelBooking(profileId, sessionId);
  revalidatePath(`/admin/member/${profileId}`);
}

const PRIVATE_TRIAL_DURATIONS = [30, 45, 60];
const PRIVATE_TRIAL_OPEN_MIN = 8 * 60; // 8:00 AM
const PRIVATE_TRIAL_CLOSE_MIN = 20 * 60; // 8:00 PM

export async function adminBookPrivateTrial(profileId: string, formData: FormData) {
  await requireAdmin();
  const dateRaw = String(formData.get("date") ?? "");
  const timeRaw = String(formData.get("time") ?? "");
  const duration = Number(formData.get("duration") ?? 0);
  const instructor =
    String(formData.get("instructor") ?? "").trim().slice(0, 80) || "Atheneum Coach";

  if (!PRIVATE_TRIAL_DURATIONS.includes(duration)) {
    throw new Error("Pick a 30, 45, or 60 minute session.");
  }
  const startsAt = new Date(`${dateRaw}T${timeRaw}`);
  if (!dateRaw || !timeRaw || Number.isNaN(startsAt.getTime())) {
    throw new Error("Please pick a valid date and time.");
  }
  if (startsAt < new Date()) throw new Error("That time is in the past.");

  const startMins = startsAt.getHours() * 60 + startsAt.getMinutes();
  if (startMins < PRIVATE_TRIAL_OPEN_MIN || startMins + duration > PRIVATE_TRIAL_CLOSE_MIN) {
    throw new Error("Private trials run between 8:00 AM and 8:00 PM.");
  }

  const profile = await prisma.memberProfile.findUniqueOrThrow({ where: { id: profileId } });
  if (profile.membershipType === "TRIAL") {
    const trialEnd = trialEndOfDay(profile.membershipRenewsAt);
    if (!trialEnd || startsAt > trialEnd) {
      throw new Error("That time is after the trial ends — extend the trial or pick an earlier slot.");
    }
  }

  const endsAt = new Date(startsAt.getTime() + duration * 60000);
  const dayLo = new Date(startsAt);
  dayLo.setHours(0, 0, 0, 0);
  const dayHi = new Date(startsAt);
  dayHi.setHours(23, 59, 59, 999);
  const sameDay = await prisma.classSession.findMany({
    where: { status: { not: "CANCELLED" }, startsAt: { gte: dayLo, lte: dayHi } },
    include: { template: true },
  });
  const conflict = sameDay.find((s) => {
    const sEnd = new Date(s.startsAt.getTime() + s.template.durationMin * 60000);
    return s.startsAt < endsAt && sEnd > startsAt;
  });
  if (conflict) {
    throw new Error(
      `That time overlaps ${conflict.template.name} at ${formatTime(conflict.startsAt)} — pick an open slot.`
    );
  }

  const program = await prisma.program.upsert({
    where: { name: "Private Training" },
    update: {},
    create: {
      name: "Private Training",
      description: "One-on-one and small-group sessions with a coach.",
      color: "green",
    },
  });
  const templateName = `Private Trial (${duration} min)`;
  let template = await prisma.classTemplate.findFirst({ where: { name: templateName } });
  if (!template) {
    template = await prisma.classTemplate.create({
      data: {
        name: templateName,
        description: "Introductory one-on-one session with a coach.",
        ageGroup: "ALL",
        level: "BEGINNER",
        capacity: 1,
        durationMin: duration,
        programId: program.id,
      },
    });
  }

  const session = await prisma.classSession.create({
    data: { startsAt, instructor, templateId: template.id },
  });
  await prisma.booking.create({
    data: { profileId, sessionId: session.id, status: "BOOKED" },
  });

  revalidatePath(`/admin/member/${profileId}`);
  revalidatePath("/");
  revalidatePath("/schedule");
}

export async function addChildProfile(householdId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const birthYear = Number(formData.get("birthYear") ?? 0) || null;
  if (!name) throw new Error("Please add the child's name.");
  await prisma.household.findUniqueOrThrow({ where: { id: householdId } });

  // Kids in a trial household share the household's trial.
  const trialProfile = await prisma.memberProfile.findFirst({
    where: { householdId, membershipType: "TRIAL" },
  });

  await prisma.memberProfile.create({
    data: {
      name,
      isChild: true,
      birthYear,
      householdId,
      ...(trialProfile
        ? {
            membershipPlan: "Trial",
            membershipType: "TRIAL",
            membershipRenewsAt: trialProfile.membershipRenewsAt,
          }
        : {}),
    },
  });

  revalidatePath("/admin");
}

export async function updateMembership(profileId: string, formData: FormData) {
  await requireAdmin();
  const membershipPlan = String(formData.get("membershipPlan") ?? "").trim().slice(0, 80) || null;
  const membershipType = String(formData.get("membershipType") ?? "");
  if (!["", "MONTHLY", "PUNCH_PASS", "TRIAL"].includes(membershipType)) {
    throw new Error("Invalid membership type.");
  }
  const renewsAtRaw = String(formData.get("membershipRenewsAt") ?? "");
  const parsedRenewsAt = renewsAtRaw ? new Date(`${renewsAtRaw}T00:00:00`) : null;
  if (parsedRenewsAt && Number.isNaN(parsedRenewsAt.getTime())) {
    throw new Error("Please enter the renewal date as YYYY-MM-DD.");
  }
  const membershipRenewsAt = parsedRenewsAt;
  const punchPassTotal = Number(formData.get("punchPassTotal") ?? 0) || null;
  const punchPassUsed = Math.max(Number(formData.get("punchPassUsed") ?? 0) || 0, 0);

  await prisma.memberProfile.update({
    where: { id: profileId },
    data: {
      membershipPlan,
      membershipType: membershipType || null,
      membershipRenewsAt:
        membershipType === "MONTHLY" || membershipType === "TRIAL" ? membershipRenewsAt : null,
      punchPassTotal: membershipType === "PUNCH_PASS" ? punchPassTotal ?? 10 : null,
      punchPassUsed: membershipType === "PUNCH_PASS" ? punchPassUsed : 0,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin");
}

export async function changeOwnPassword(formData: FormData) {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await bcrypt.compare(currentPassword, account.passwordHash))) {
    throw new Error("Your current password doesn't match.");
  }
  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });

  redirect("/account?updated=1");
}

export async function createPost(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const category = String(formData.get("category") ?? "GENERAL");
  if (!body) throw new Error("Please write something to post.");
  if (!["GENERAL", "QUESTION", "NEWS"].includes(category)) throw new Error("Invalid category.");

  const photo = formData.get("photo");
  let photoType = "";
  let photoBuffer: Buffer | null = null;
  if (photo instanceof Blob && photo.size > 0) {
    if (photo.size > 8 * 1024 * 1024) throw new Error("Photo is too large — please use one under 8 MB.");
    if (!PHOTO_TYPES.includes(photo.type)) throw new Error("Please use a JPEG, PNG, or WebP photo.");
    photoType = photo.type;
    photoBuffer = Buffer.from(await photo.arrayBuffer());
  }

  const post = await prisma.post.create({
    data: { title, body, category, photoType, authorId: user.id },
  });
  if (photoBuffer) {
    await ensureUploadsDir();
    await fs.writeFile(path.join(uploadsDir(), `post-${post.id}`), photoBuffer);
  }

  revalidatePath("/community");
}

export async function deletePost(postId: string) {
  const user = await requireUser();
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
  const isStaff = user.role === "COACH" || user.role === "ADMIN";
  if (post.authorId !== user.id && !isStaff) {
    throw new Error("You can only delete your own posts.");
  }

  await prisma.post.delete({ where: { id: postId } });
  if (post.photoType) {
    await fs.unlink(path.join(uploadsDir(), `post-${postId}`)).catch(() => {});
  }

  revalidatePath("/community");
}

export async function addComment(postId: string, formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!body) throw new Error("Please write a comment.");
  await prisma.post.findUniqueOrThrow({ where: { id: postId } });

  await prisma.comment.create({ data: { body, postId, authorId: user.id } });

  revalidatePath("/community");
}

export async function deleteComment(commentId: string) {
  const user = await requireUser();
  const comment = await prisma.comment.findUniqueOrThrow({ where: { id: commentId } });
  const isStaff = user.role === "COACH" || user.role === "ADMIN";
  if (comment.authorId !== user.id && !isStaff) {
    throw new Error("You can only delete your own comments.");
  }

  await prisma.comment.delete({ where: { id: commentId } });

  revalidatePath("/community");
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
