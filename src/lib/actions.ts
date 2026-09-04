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
import { formatDay, formatTime } from "./format";
import { bookingLimit } from "./capacity";
import { isLateCheckIn } from "./attendance";
import { trialEndOfDay } from "./trial";
import { trackEvent } from "./telemetry";
import { recordAudit } from "./audit";
import { isLockedOut, rateLimit, recordFailure } from "./rateLimit";
import { RETENTION_YEARS, purgeDueAt, purgeProfileData } from "./leavers";
import {
  appUrl,
  sendEmail,
  sendPasswordResetEmail,
  sendTrialBookingEmail,
  sendTrialWelcomeEmail,
} from "./email";

export type LoginState = { error?: string };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (isLockedOut(`login:${email}`, 10)) {
    return { error: "Too many failed sign-in attempts. Please wait a few minutes and try again." };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    recordFailure(`login:${email}`, 5 * 60 * 1000);
    return { error: "That email and password combination doesn't match our records." };
  }
  if (user.deactivatedAt) {
    return { error: "This account has been deactivated — please speak to the front desk." };
  }
  const session = await getSession();
  session.userId = user.id;
  session.impersonatorId = undefined;
  await session.save();
  await trackEvent("LOGIN", { userId: user.id });
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
  if (!rateLimit("pw-reset", 5, 15 * 60 * 1000)) {
    return { error: "Too many reset requests. Please wait a few minutes and try again." };
  }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.deactivatedAt) {
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

  await trackEvent("SELF_PASSWORD_RESET", { userId: record.userId });
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

function failTo(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function succeedTo(path: string, message: string): never {
  redirect(`${path}?success=${encodeURIComponent(message)}`);
}

export async function bookClass(
  profileId: string,
  sessionId: string,
  errorPath: string = "/schedule"
) {
  const user = await requireUser();
  await assertProfileInHousehold(user.id, profileId);

  const target = await prisma.classSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { template: true },
  });
  const profile = await prisma.memberProfile.findUniqueOrThrow({ where: { id: profileId } });
  if (profile.membershipType === "TRIAL") {
    const trialEnd = trialEndOfDay(profile.membershipRenewsAt);
    if (!trialEnd || target.startsAt > trialEnd || new Date() > trialEnd) {
      failTo(
        errorPath,
        "That class is outside the trial period — see the front desk to start a membership."
      );
    }
    const isPrivateTrialSession = target.template.name.startsWith("Private Trial");
    if (profile.trialClassType === "PRIVATE" && !isPrivateTrialSession) {
      failTo(
        errorPath,
        "This trial covers a private session only — talk to the front desk about group classes."
      );
    }
  }

  const bookedStatus = await bookProfileIntoSession(profileId, sessionId);

  await trackEvent(user.role === "ADMIN" ? "ADMIN_BOOKING" : "SELF_BOOKING", {
    userId: user.id,
    profileId,
    metadata: bookedStatus,
  });

  revalidatePath("/");
  revalidatePath("/schedule");
}

async function bookProfileIntoSession(profileId: string, sessionId: string) {
  return prisma.$transaction(async (tx) => {
    const bookingProfile = await tx.memberProfile.findUniqueOrThrow({
      where: { id: profileId },
    });
    if (bookingProfile.deactivatedAt) {
      throw new Error("This account is deactivated and can't be booked into classes.");
    }
    // Lock the session row up front so the capacity check serializes.
    await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionId} FOR UPDATE`;
    const classSession = await tx.classSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { template: true, bookings: { where: { status: "BOOKED" } } },
    });
    if (classSession.status === "CANCELLED") throw new Error("This class has been cancelled.");
    if (classSession.startsAt < new Date()) throw new Error("This class has already started.");

    const isFull = classSession.bookings.length >= bookingLimit(classSession.template.capacity);
    const status = isFull ? "WAITLISTED" : "BOOKED";

    await tx.booking.upsert({
      where: { profileId_sessionId: { profileId, sessionId } },
      update: { status },
      create: { profileId, sessionId, status },
    });
    return status;
  });
}

async function cancelProfileBooking(profileId: string, sessionId: string) {
  return prisma.$transaction(async (tx) => {
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
        return nextInLine.profileId;
      }
    }
    return null;
  });
}

export async function cancelBooking(profileId: string, sessionId: string) {
  const user = await requireUser();
  await assertProfileInHousehold(user.id, profileId);

  const promotedProfileId = await cancelProfileBooking(profileId, sessionId);

  await trackEvent(user.role === "ADMIN" ? "ADMIN_CANCELLATION" : "SELF_CANCELLATION", {
    userId: user.id,
    profileId,
  });
  if (promotedProfileId) {
    await trackEvent("WAITLIST_PROMOTION", { profileId: promotedProfileId });
  }

  revalidatePath("/");
  revalidatePath("/schedule");
}

export async function toggleAttendance(profileId: string, sessionId: string) {
  const coach = await requireCoach();
  const result = await prisma.$transaction(async (tx) => {
    // Lock the profile row up front so the punch-pass update serializes.
    await tx.$queryRaw`SELECT id FROM "MemberProfile" WHERE id = ${profileId} FOR UPDATE`;
    const existing = await tx.attendance.findUnique({
      where: { profileId_sessionId: { profileId, sessionId } },
    });
    const profile = await tx.memberProfile.findUniqueOrThrow({ where: { id: profileId } });
    const classSession = await tx.classSession.findUniqueOrThrow({ where: { id: sessionId } });
    const isPunchPass = profile.membershipType === "PUNCH_PASS";
    if (existing) {
      await tx.attendance.delete({ where: { id: existing.id } });
      if (isPunchPass && profile.punchPassUsed > 0) {
        await tx.memberProfile.update({
          where: { id: profileId },
          data: { punchPassUsed: { decrement: 1 } },
        });
      }
      return { verb: "removed", memberName: profile.name };
    }
    await tx.attendance.create({
      data: { profileId, sessionId, recordedBy: coach.name, late: isLateCheckIn(classSession.startsAt) },
    });
    if (isPunchPass) {
      await tx.memberProfile.update({
        where: { id: profileId },
        data: { punchPassUsed: { increment: 1 } },
      });
    }
    return { verb: "recorded", memberName: profile.name };
  });
  await recordAudit(coach, "ATTENDANCE_TOGGLED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Attendance ${result.verb} for ${result.memberName}`,
  });
  revalidatePath(`/coach/session/${sessionId}`);
  revalidatePath("/coach");
  revalidatePath("/progress");
  revalidatePath("/");
}

export async function coachWalkInCheckIn(sessionId: string, formData: FormData) {
  await requireCoach();
  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return;
  const existing = await prisma.attendance.findUnique({
    where: { profileId_sessionId: { profileId, sessionId } },
  });
  if (existing) {
    redirect(`/coach/session/${sessionId}`);
  }
  await toggleAttendance(profileId, sessionId);
  redirect(`/coach/session/${sessionId}`);
}

export async function coachAddToRoster(sessionId: string, formData: FormData) {
  const coach = await requireCoach();
  const profileId = String(formData.get("profileId") ?? "");
  const sessionPath = `/coach/session/${sessionId}`;
  if (!profileId) redirect(sessionPath);

  const [profile, session] = await Promise.all([
    prisma.memberProfile.findUniqueOrThrow({ where: { id: profileId } }),
    prisma.classSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { template: true },
    }),
  ]);

  let status: string;
  try {
    status = await bookProfileIntoSession(profileId, sessionId);
  } catch (err) {
    failTo(sessionPath, err instanceof Error ? err.message : "Couldn't add that member.");
  }

  await trackEvent("ADMIN_BOOKING", { userId: coach.id, profileId, metadata: status });
  await recordAudit(coach, "BOOKING_CREATED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `${status === "WAITLISTED" ? "Waitlisted" : "Added"} ${profile.name} ${status === "WAITLISTED" ? "for" : "to"} ${session.template.name}`,
  });

  revalidatePath(sessionPath);
  revalidatePath("/coach");
  revalidatePath("/schedule");
  succeedTo(
    sessionPath,
    status === "WAITLISTED"
      ? `Class is full — ${profile.name} was added to the waitlist.`
      : `${profile.name} added to the class.`
  );
}

export async function coachRemoveFromRoster(profileId: string, sessionId: string) {
  const coach = await requireCoach();
  const sessionPath = `/coach/session/${sessionId}`;

  const [profile, session] = await Promise.all([
    prisma.memberProfile.findUniqueOrThrow({ where: { id: profileId } }),
    prisma.classSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { template: true },
    }),
  ]);

  const promotedProfileId = await cancelProfileBooking(profileId, sessionId);

  await trackEvent("ADMIN_CANCELLATION", { userId: coach.id, profileId });
  if (promotedProfileId) {
    await trackEvent("WAITLIST_PROMOTION", { profileId: promotedProfileId });
  }
  await recordAudit(coach, "BOOKING_CANCELLED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Removed ${profile.name} from ${session.template.name}`,
  });

  revalidatePath(sessionPath);
  revalidatePath("/coach");
  revalidatePath("/schedule");
  succeedTo(sessionPath, `${profile.name} removed from the class.`);
}

export async function placeOrder(productId: string, formData: FormData) {
  const user = await requireUser();
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  if (!product.active) failTo("/shop", "This item is not available right now.");

  const sizeOptions = product.sizes ? product.sizes.split(",") : [];
  const size = String(formData.get("size") ?? "");
  if (sizeOptions.length > 0 && !sizeOptions.includes(size)) {
    failTo("/shop", "Please choose a size.");
  }
  const quantity = Math.min(Math.max(Number(formData.get("quantity") ?? 1) || 1, 1), 10);

  try {
    await prisma.$transaction(async (tx) => {
      // Lock the product row so concurrent orders can't oversell tracked stock.
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
      const fresh = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      if (fresh.stockCount !== null) {
        if (fresh.stockCount < quantity) {
          throw new Error(
            fresh.stockCount === 0
              ? "This item is out of stock."
              : `Only ${fresh.stockCount} left in stock.`
          );
        }
        await tx.product.update({
          where: { id: productId },
          data: { stockCount: { decrement: quantity } },
        });
      }
      await tx.order.create({
        data: {
          userId: user.id,
          productId: product.id,
          size: sizeOptions.length > 0 ? size : "",
          quantity,
          priceCents: product.priceCents,
        },
      });
    });
  } catch (err) {
    failTo("/shop", err instanceof Error ? err.message : "Couldn't place the order — please try again.");
  }

  revalidatePath("/shop");
  revalidatePath("/admin/shop");
  revalidatePath("/coach/orders");
  succeedTo("/shop", `Order placed — pay for your ${product.name} at the front desk at pickup.`);
}

async function restockCancelledOrder(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { product: true },
    });
    if (order.product.stockCount !== null) {
      await tx.product.update({
        where: { id: order.productId },
        data: { stockCount: { increment: order.quantity } },
      });
    }
  });
}

export async function cancelOrder(orderId: string) {
  const user = await requireUser();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.userId !== user.id) throw new Error("You can only cancel your own orders.");
  if (order.status !== "PLACED") throw new Error("This order can no longer be cancelled.");

  await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  await restockCancelledOrder(orderId);

  revalidatePath("/shop");
  revalidatePath("/admin/shop");
  revalidatePath("/coach/orders");
}

export async function updateOrderStatus(orderId: string, status: string) {
  const coach = await requireCoach();
  if (!["PLACED", "READY", "PICKED_UP", "CANCELLED"].includes(status)) {
    throw new Error("Invalid order status.");
  }
  const previous = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: { product: true },
  });
  if (status === "CANCELLED" && previous.status !== "CANCELLED") {
    await restockCancelledOrder(orderId);
  }
  await recordAudit(coach, "ORDER_STATUS_UPDATED", {
    targetType: "Order",
    targetId: orderId,
    summary: `${order.product.name} order marked ${status}`,
  });

  revalidatePath("/shop");
  revalidatePath("/admin/shop");
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

  const announcement = await prisma.announcement.create({
    data: { title, body, author: coach.name },
  });
  await recordAudit(coach, "ANNOUNCEMENT_POSTED", {
    targetType: "Announcement",
    targetId: announcement.id,
    summary: `Posted \"${title}\"`,
  });

  revalidatePath("/coach");
  revalidatePath("/");
}

export async function deleteAnnouncement(announcementId: string) {
  const coach = await requireCoach();
  const announcement = await prisma.announcement.delete({ where: { id: announcementId } });
  await recordAudit(coach, "ANNOUNCEMENT_DELETED", {
    targetType: "Announcement",
    targetId: announcementId,
    summary: `Deleted \"${announcement.title}\"`,
  });

  revalidatePath("/coach");
  revalidatePath("/");
}

export async function createMemberAccount(formData: FormData) {
  const admin = await requireAdmin();
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
  const trialClassType = String(formData.get("trialClassType") ?? "BOTH");
  if (!TRIAL_CLASS_TYPES.includes(trialClassType)) throw new Error("Invalid trial class type.");
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
        ? {
            membershipPlan: "Trial",
            membershipType: "TRIAL",
            membershipRenewsAt: trialEndsAt,
            trialClassType,
            trialStartedAt: new Date(),
          }
        : {}),
    },
  });

  if (isTrial) {
    await trackEvent("TRIAL_STARTED", { userId: user.id, profileId: profile.id });
    try {
      await sendTrialWelcomeEmail(email, name.split(" ")[0], password, trialEndsAt);
    } catch (err) {
      console.error("[email] trial welcome email failed:", err);
    }
  }

  await recordAudit(admin, "ACCOUNT_CREATED", {
    targetType: "User",
    targetId: user.id,
    summary: `Created ${isTrial ? "trial " : ""}${role.toLowerCase()} account for ${name}`,
  });

  revalidatePath("/admin");
  succeedTo(
    `/admin/member/${profile.id}`,
    isTrial
      ? "Account created — the welcome email with sign-in details is on its way. Next: book their first class below."
      : "Account created. Next: set up their membership below."
  );
}

async function notifyTrialBooking(
  profileId: string,
  className: string,
  startsAt: Date
): Promise<boolean> {
  try {
    const profile = await prisma.memberProfile.findUnique({
      where: { id: profileId },
      include: { user: true, household: { include: { users: true } } },
    });
    if (!profile || profile.membershipType !== "TRIAL") return false;
    const recipient = profile.user ?? profile.household.users[0];
    if (!recipient) return false;
    await sendTrialBookingEmail(
      recipient.email,
      profile.name.split(" ")[0],
      className,
      startsAt
    );
    return true;
  } catch (err) {
    console.error("[email] trial booking email failed:", err);
    return false;
  }
}

export async function adminBookClass(profileId: string, formData: FormData) {
  const admin = await requireAdmin();
  const memberPath = `/admin/member/${profileId}`;
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) failTo(memberPath, "Please pick a class.");
  await bookClass(profileId, sessionId, memberPath);
  const booking = await prisma.booking.findFirst({
    where: { profileId, sessionId, status: { in: ["BOOKED", "WAITLISTED"] } },
    include: { session: { include: { template: true } } },
  });
  revalidatePath(memberPath);
  if (booking) {
    const when = `${formatDay(booking.session.startsAt)} at ${formatTime(booking.session.startsAt)}`;
    await recordAudit(admin, "BOOKING_CREATED", {
      targetType: "MemberProfile",
      targetId: profileId,
      summary: `${booking.status === "WAITLISTED" ? "Waitlisted" : "Booked"} ${booking.session.template.name} on ${when}`,
    });
    if (booking.status === "WAITLISTED") {
      succeedTo(
        memberPath,
        `That class is full — added to the waitlist for ${booking.session.template.name} on ${when}.`
      );
    }
    const emailed = await notifyTrialBooking(
      profileId,
      booking.session.template.name,
      booking.session.startsAt
    );
    succeedTo(
      memberPath,
      `Booked ${booking.session.template.name} on ${when}.${emailed ? " A confirmation email is on its way." : ""}`
    );
  }
}

export async function adminCancelBooking(profileId: string, sessionId: string) {
  const admin = await requireAdmin();
  const [profile, session] = await Promise.all([
    prisma.memberProfile.findUnique({ where: { id: profileId } }),
    prisma.classSession.findUnique({ where: { id: sessionId }, include: { template: true } }),
  ]);
  await cancelBooking(profileId, sessionId);
  const what = session
    ? `${session.template.name} on ${formatDay(session.startsAt)} at ${formatTime(session.startsAt)}`
    : "a booking";
  await recordAudit(admin, "BOOKING_CANCELLED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Cancelled ${what}${profile ? ` for ${profile.name}` : ""}`,
  });
  revalidatePath(`/admin/member/${profileId}`);
  succeedTo(`/admin/member/${profileId}`, "Booking cancelled.");
}

const TRIAL_CLASS_TYPES = ["BOTH", "GROUP", "PRIVATE"];
const PRIVATE_TRIAL_DURATIONS = [30, 45, 60];
const PRIVATE_TRIAL_OPEN_MIN = 8 * 60; // 8:00 AM
const PRIVATE_TRIAL_CLOSE_MIN = 20 * 60; // 8:00 PM

export async function adminBookPrivateTrial(profileId: string, formData: FormData) {
  const admin = await requireAdmin();
  const memberPath = `/admin/member/${profileId}`;
  const dateRaw = String(formData.get("date") ?? "");
  const timeRaw = String(formData.get("time") ?? "");
  const duration = Number(formData.get("duration") ?? 0);
  const instructor =
    String(formData.get("instructor") ?? "").trim().slice(0, 80) || "Atheneum Coach";

  if (!PRIVATE_TRIAL_DURATIONS.includes(duration)) {
    failTo(memberPath, "Pick a 30, 45, or 60 minute session.");
  }
  const startsAt = new Date(`${dateRaw}T${timeRaw}`);
  if (!dateRaw || !timeRaw || Number.isNaN(startsAt.getTime())) {
    failTo(memberPath, "Please pick a valid date and time.");
  }
  if (startsAt < new Date()) failTo(memberPath, "That time is in the past.");

  const startMins = startsAt.getHours() * 60 + startsAt.getMinutes();
  if (startMins < PRIVATE_TRIAL_OPEN_MIN || startMins + duration > PRIVATE_TRIAL_CLOSE_MIN) {
    failTo(memberPath, "Private trials run between 8:00 AM and 8:00 PM.");
  }

  const profile = await prisma.memberProfile.findUniqueOrThrow({ where: { id: profileId } });
  if (profile.membershipType === "TRIAL") {
    if (profile.trialClassType === "GROUP") {
      failTo(
        memberPath,
        "This trial is set to group classes only — change the trial class type in Membership to book a private trial."
      );
    }
    const trialEnd = trialEndOfDay(profile.membershipRenewsAt);
    if (!trialEnd || startsAt > trialEnd) {
      failTo(memberPath, "That time is after the trial ends — extend the trial or pick an earlier slot.");
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
    failTo(
      memberPath,
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

  const emailed = await notifyTrialBooking(profileId, templateName, startsAt);

  await recordAudit(admin, "PRIVATE_TRIAL_BOOKED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Booked ${duration}-min private trial on ${formatDay(startsAt)} at ${formatTime(startsAt)}`,
  });

  revalidatePath(`/admin/member/${profileId}`);
  revalidatePath("/");
  revalidatePath("/schedule");
  succeedTo(
    memberPath,
    `Booked a ${duration}-minute private trial on ${formatDay(startsAt)} at ${formatTime(startsAt)}.${emailed ? " A confirmation email is on its way." : ""}`
  );
}

export async function addChildProfile(householdId: string, formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const birthYear = Number(formData.get("birthYear") ?? 0) || null;
  if (!name) throw new Error("Please add the child's name.");
  await prisma.household.findUniqueOrThrow({ where: { id: householdId } });

  // Kids in a trial household share the household's trial.
  const trialProfile = await prisma.memberProfile.findFirst({
    where: { householdId, membershipType: "TRIAL" },
  });

  const child = await prisma.memberProfile.create({
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
            trialClassType: trialProfile.trialClassType,
            trialStartedAt: new Date(),
          }
        : {}),
    },
  });

  if (trialProfile) {
    await trackEvent("TRIAL_STARTED", { profileId: child.id });
  }

  await recordAudit(admin, "CHILD_ADDED", {
    targetType: "MemberProfile",
    targetId: child.id,
    summary: `Added child ${name}`,
  });

  revalidatePath("/admin");
}

export async function updateMembership(profileId: string, formData: FormData) {
  const admin = await requireAdmin();
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
  const trialClassType = String(formData.get("trialClassType") ?? "BOTH");
  if (!TRIAL_CLASS_TYPES.includes(trialClassType)) throw new Error("Invalid trial class type.");

  const existing = await prisma.memberProfile.findUniqueOrThrow({ where: { id: profileId } });
  const converted =
    existing.membershipType === "TRIAL" &&
    (membershipType === "MONTHLY" || membershipType === "PUNCH_PASS");
  const becameTrial = existing.membershipType !== "TRIAL" && membershipType === "TRIAL";

  const updated = await prisma.memberProfile.update({
    where: { id: profileId },
    data: {
      membershipPlan,
      membershipType: membershipType || null,
      membershipRenewsAt:
        membershipType === "MONTHLY" || membershipType === "TRIAL" ? membershipRenewsAt : null,
      punchPassTotal: membershipType === "PUNCH_PASS" ? punchPassTotal ?? 10 : null,
      punchPassUsed: membershipType === "PUNCH_PASS" ? punchPassUsed : 0,
      trialClassType: membershipType === "TRIAL" ? trialClassType : "BOTH",
      ...(converted ? { trialConvertedAt: new Date() } : {}),
      ...(becameTrial && !existing.trialStartedAt ? { trialStartedAt: new Date() } : {}),
    },
  });

  if (converted) {
    await trackEvent("TRIAL_CONVERTED", { profileId, metadata: membershipType });
  }

  await recordAudit(admin, "MEMBERSHIP_UPDATED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Set ${updated.name}'s membership to ${membershipType || "none"}${membershipPlan ? ` (${membershipPlan})` : ""}`,
  });

  revalidatePath("/admin");
  revalidatePath("/");
  succeedTo(`/admin/member/${profileId}`, "Membership saved.");
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
  if (isStaff && post.authorId !== user.id) {
    await recordAudit(user, "POST_MODERATED", {
      targetType: "Post",
      targetId: postId,
      summary: `Deleted a member's community post${post.title ? ` \"${post.title}\"` : ""}`,
    });
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
  if (isStaff && comment.authorId !== user.id) {
    await recordAudit(user, "COMMENT_MODERATED", {
      targetType: "Comment",
      targetId: commentId,
      summary: "Deleted a member's comment",
    });
  }

  revalidatePath("/community");
}

export async function resetMemberPassword(
  userId: string,
  profileId: string,
  formData: FormData
) {
  const admin = await requireAdmin();
  const memberPath = `/admin/member/${profileId}`;
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) failTo(memberPath, "Password must be at least 8 characters.");

  const target = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });

  await recordAudit(admin, "PASSWORD_RESET_BY_ADMIN", {
    targetType: "User",
    targetId: userId,
    summary: `Reset password for ${target.name}`,
  });

  revalidatePath("/admin");
  succeedTo(memberPath, "Password updated — share it with the member directly.");
}

export async function impersonateUser(userId: string) {
  const admin = await requireAdmin();
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.id === admin.id || target.deactivatedAt) redirect("/admin");

  const session = await getSession();
  session.userId = target.id;
  session.impersonatorId = admin.id;
  await session.save();

  await recordAudit(admin, "IMPERSONATION_STARTED", {
    targetType: "User",
    targetId: target.id,
    summary: `Viewed the portal as ${target.name}`,
  });

  redirect(target.role === "COACH" ? "/coach" : "/");
}

export async function stopImpersonating() {
  const session = await getSession();
  const adminId = session.impersonatorId;
  if (!adminId) redirect("/");

  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== "ADMIN") {
    session.destroy();
    redirect("/login");
  }

  session.userId = admin.id;
  session.impersonatorId = undefined;
  await session.save();

  redirect("/admin");
}

export async function deactivateAccount(profileId: string) {
  const admin = await requireAdmin();
  const memberPath = `/admin/member/${profileId}`;
  const profile = await prisma.memberProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: { user: true },
  });
  if (profile.user?.id === admin.id) failTo(memberPath, "You can't deactivate your own account.");
  if (profile.deactivatedAt) failTo(memberPath, `${profile.name} is already on leaver hold.`);

  const now = new Date();
  const upcoming = await prisma.booking.findMany({
    where: {
      profileId,
      status: { in: ["BOOKED", "WAITLISTED"] },
      session: { startsAt: { gt: now } },
    },
    select: { sessionId: true },
  });
  for (const booking of upcoming) {
    const promotedProfileId = await cancelProfileBooking(profileId, booking.sessionId);
    if (promotedProfileId) {
      await trackEvent("WAITLIST_PROMOTION", { profileId: promotedProfileId });
    }
  }

  await prisma.memberProfile.update({
    where: { id: profileId },
    data: { deactivatedAt: now },
  });
  if (profile.user) {
    await prisma.user.update({
      where: { id: profile.user.id },
      data: { deactivatedAt: now },
    });
  }

  await recordAudit(admin, "ACCOUNT_DEACTIVATED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Placed ${profile.name} on leaver hold (data retained ${RETENTION_YEARS} years)`,
  });

  revalidatePath("/admin");
  succeedTo(
    memberPath,
    `${profile.name} is now on leaver hold — access revoked, data retained until ${purgeDueAt(now).toLocaleDateString("en-US")}.`
  );
}

export async function reactivateAccount(profileId: string) {
  const admin = await requireAdmin();
  const memberPath = `/admin/member/${profileId}`;
  const profile = await prisma.memberProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: { user: true },
  });
  if (!profile.deactivatedAt) failTo(memberPath, `${profile.name} is already active.`);

  await prisma.memberProfile.update({
    where: { id: profileId },
    data: { deactivatedAt: null },
  });
  if (profile.user) {
    await prisma.user.update({
      where: { id: profile.user.id },
      data: { deactivatedAt: null },
    });
  }

  await recordAudit(admin, "ACCOUNT_REACTIVATED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Reactivated ${profile.name} from leaver hold`,
  });

  revalidatePath("/admin");
  succeedTo(memberPath, `${profile.name} is active again — access restored with all their history intact.`);
}

export async function deleteAccountData(profileId: string, formData: FormData) {
  const admin = await requireAdmin();
  const memberPath = `/admin/member/${profileId}`;
  const profile = await prisma.memberProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: { user: true },
  });
  if (profile.user?.id === admin.id) failTo(memberPath, "You can't delete your own account.");

  const confirmName = String(formData.get("confirmName") ?? "").trim();
  if (confirmName.toLowerCase() !== profile.name.toLowerCase()) {
    failTo(memberPath, `Type "${profile.name}" exactly to confirm permanent deletion.`);
  }

  const name = await purgeProfileData(profileId);

  await recordAudit(admin, "ACCOUNT_DELETED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Permanently deleted all data for ${name ?? profile.name}`,
  });

  revalidatePath("/admin");
  succeedTo("/admin", `All data for ${name ?? profile.name} has been permanently deleted.`);
}

export async function dismissStartHere() {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { startHereDismissedAt: new Date() },
  });
  revalidatePath("/");
  revalidatePath("/coach");
}

export async function submitFeedback(formData: FormData) {
  const user = await requireUser();
  if (!rateLimit("feedback", 10, 15 * 60 * 1000)) {
    failTo("/feedback", "Too many feedback submissions — please wait a few minutes and try again.");
  }
  const message = String(formData.get("message") ?? "").trim();
  if (!message) failTo("/feedback", "Please write a short note before sending.");
  if (message.length > 2000) failTo("/feedback", "Feedback must be 2000 characters or fewer.");

  await prisma.feedback.create({ data: { userId: user.id, message } });

  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", deactivatedAt: null },
      select: { email: true },
    });
    await Promise.all(
      admins.map((a) =>
        sendEmail(
          a.email,
          `Portal feedback from ${user.name}`,
          `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#0039b7">Atheneum Martial Arts</h2>
            <p><strong>${user.name}</strong> (${user.email}) sent feedback:</p>
            <blockquote style="border-left:3px solid #0039b7;margin:0;padding:8px 12px;background:#f5f5f4">${message
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</blockquote>
            <p><a href="${appUrl()}/admin/feedback">View all feedback</a></p>
          </div>`
        )
      )
    );
  } catch (err) {
    console.error("Feedback notification email failed:", err);
  }

  succeedTo("/feedback", "Thanks — your feedback is on its way to the team!");
}

export async function resolveFeedback(feedbackId: string, formData: FormData) {
  const admin = await requireAdmin();
  const resolved = String(formData.get("resolved") ?? "") === "1";
  const item = await prisma.feedback.update({
    where: { id: feedbackId },
    data: { resolvedAt: resolved ? new Date() : null },
    include: { user: { select: { name: true } } },
  });
  await recordAudit(admin, "FEEDBACK_UPDATED", {
    targetType: "Feedback",
    targetId: feedbackId,
    summary: `Marked feedback from ${item.user.name} as ${resolved ? "resolved" : "open"}`,
  });
  revalidatePath("/admin/feedback");
}
