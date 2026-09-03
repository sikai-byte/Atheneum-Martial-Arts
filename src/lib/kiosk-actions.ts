"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireAdmin, requireUser } from "./auth";
import { getSession } from "./session";
import { getKioskSession, isKioskEnabled } from "./kiosk";
import { trackEvent } from "./telemetry";
import { recordAudit } from "./audit";
import { appUrl, sendEmail } from "./email";
import { WAIVER_VERSION } from "./waiver";
import { isLockedOut, rateLimit, recordFailure } from "./rateLimit";

const KIOSK_ACTOR = { id: "kiosk", name: "Front-desk kiosk", role: "KIOSK" };

function validPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

// ---------- Kiosk mode (device enrollment) ----------

export async function enableKioskMode() {
  await requireAdmin();
  const kiosk = await getKioskSession();
  kiosk.enabled = true;
  await kiosk.save();
  // Sign the admin out on this device so the kiosk can't reach staff pages.
  const session = await getSession();
  session.destroy();
  redirect("/kiosk");
}

export async function disableKioskMode() {
  await requireAdmin();
  const kiosk = await getKioskSession();
  kiosk.destroy();
  redirect("/admin/kiosk");
}

// ---------- PIN management ----------

export type PinState = { error?: string; success?: string };

/** Admin sets or resets the kiosk PIN for any member profile. */
export async function adminSetPin(profileId: string, formData: FormData) {
  const admin = await requireAdmin();
  const pin = String(formData.get("pin") ?? "").trim();
  const memberPath = `/admin/member/${profileId}`;
  if (!validPin(pin)) {
    redirect(`${memberPath}?error=${encodeURIComponent("PIN must be exactly 4 digits.")}`);
  }
  const profile = await prisma.memberProfile.update({
    where: { id: profileId },
    data: { pinHash: await bcrypt.hash(pin, 10) },
  });
  await recordAudit(admin, "PIN_SET", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Set kiosk check-in PIN for ${profile.name}`,
  });
  revalidatePath(memberPath);
  redirect(`${memberPath}?success=${encodeURIComponent(`Kiosk PIN saved for ${profile.name}.`)}`);
}

/** A member or parent sets the kiosk PIN for a profile in their own household. */
export async function setOwnPin(profileId: string, formData: FormData) {
  const user = await requireUser();
  const pin = String(formData.get("pin") ?? "").trim();
  if (!validPin(pin)) {
    redirect(`/account?pinError=${encodeURIComponent("PIN must be exactly 4 digits.")}`);
  }
  const profile = await prisma.memberProfile.findUnique({ where: { id: profileId } });
  if (!profile || profile.householdId !== user.householdId) redirect("/account");
  await prisma.memberProfile.update({
    where: { id: profileId },
    data: { pinHash: await bcrypt.hash(pin, 10) },
  });
  revalidatePath("/account");
  redirect(`/account?pinSaved=${encodeURIComponent(profile.name)}`);
}

// ---------- Kiosk check-in ----------

export type KioskCheckInState = {
  error?: string;
  success?: { name: string; className: string; alreadyCheckedIn?: boolean };
};

export async function kioskCheckIn(
  sessionId: string,
  _prev: KioskCheckInState,
  formData: FormData
): Promise<KioskCheckInState> {
  if (!(await isKioskEnabled())) {
    return { error: "This device is not in kiosk mode — ask a coach for help." };
  }
  if (isLockedOut("kiosk-pin", 15)) {
    return { error: "Too many failed attempts — take a breather and try again in a few minutes." };
  }
  const pin = String(formData.get("pin") ?? "").trim();
  const profileId = String(formData.get("profileId") ?? "").trim();
  const typedName = String(formData.get("name") ?? "").trim();

  if (!validPin(pin)) return { error: "Your PIN is the 4-digit number on your account." };
  if (!profileId && !typedName) return { error: "Tap your name or type it to check in." };

  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { template: true },
  });
  if (!session || session.status !== "SCHEDULED") {
    return { error: "That class isn't available for check-in." };
  }
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (session.startsAt < dayStart || session.startsAt >= dayEnd) {
    return { error: "Check-in is only open for today's classes." };
  }

  let profile = null;
  if (profileId) {
    profile = await prisma.memberProfile.findUnique({ where: { id: profileId } });
  } else {
    const matches = await prisma.memberProfile.findMany({
      where: { name: { equals: typedName, mode: "insensitive" } },
    });
    if (matches.length > 1) {
      return { error: "More than one member has that name — ask a coach to check you in." };
    }
    profile = matches[0] ?? null;
  }
  if (!profile) {
    return { error: "We couldn't find that name — check the spelling, or register as a new member." };
  }
  if (!profile.pinHash) {
    return {
      error: `${profile.name.split(" ")[0]} doesn't have a PIN yet — a coach or a parent can set one, then try again.`,
    };
  }
  if (!(await bcrypt.compare(pin, profile.pinHash))) {
    recordFailure("kiosk-pin", 5 * 60 * 1000);
    return { error: "That PIN doesn't match — try again or ask a coach for help." };
  }

  const targetProfileId = profile.id;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "MemberProfile" WHERE id = ${targetProfileId} FOR UPDATE`;
    const existing = await tx.attendance.findUnique({
      where: { profileId_sessionId: { profileId: targetProfileId, sessionId } },
    });
    if (existing) return { alreadyCheckedIn: true };
    const fresh = await tx.memberProfile.findUniqueOrThrow({ where: { id: targetProfileId } });
    await tx.attendance.create({
      data: { profileId: targetProfileId, sessionId, recordedBy: "Kiosk self check-in" },
    });
    if (fresh.membershipType === "PUNCH_PASS") {
      await tx.memberProfile.update({
        where: { id: targetProfileId },
        data: { punchPassUsed: { increment: 1 } },
      });
    }
    return { alreadyCheckedIn: false };
  });

  if (!result.alreadyCheckedIn) {
    await trackEvent("KIOSK_CHECKIN", {
      profileId: profile.id,
      metadata: `${session.template.name} (${sessionId})`,
    });
    await recordAudit(KIOSK_ACTOR, "KIOSK_CHECKIN", {
      targetType: "MemberProfile",
      targetId: profile.id,
      summary: `${profile.name} self-checked in to ${session.template.name} at the kiosk`,
    });
  }

  revalidatePath(`/kiosk/${sessionId}`);
  revalidatePath("/kiosk");
  revalidatePath(`/coach/session/${sessionId}`);
  revalidatePath("/coach");
  revalidatePath("/progress");
  revalidatePath("/");

  return {
    success: {
      name: profile.name,
      className: session.template.name,
      alreadyCheckedIn: result.alreadyCheckedIn,
    },
  };
}

// ---------- Walk-in / drop-in registration ----------

export type RegisterState = { error?: string; success?: { name: string } };

export async function kioskRegister(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  if (!rateLimit("kiosk-register", 8, 15 * 60 * 1000)) {
    return { error: "Too many registrations from this device — please wait a few minutes." };
  }
  const kind = String(formData.get("kind") ?? "ADULT");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const childName = String(formData.get("childName") ?? "").trim();
  const birthYearRaw = String(formData.get("birthYear") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const signedName = String(formData.get("signedName") ?? "").trim();
  const agreed = formData.get("agree") === "on";

  if (!name || name.length > 80) return { error: "Please enter your full name." };
  if (!email || !email.includes("@")) return { error: "Please enter a valid email address." };
  if (!validPin(pin)) return { error: "Choose a 4-digit PIN — you'll use it to check in." };
  if (!agreed) return { error: "Please read and agree to the waiver to register." };
  if (!signedName) return { error: "Please type your full name to sign the waiver." };

  const isChild = kind === "CHILD";
  if (isChild && !childName) return { error: "Please enter your child's name." };
  const birthYear = isChild && birthYearRaw ? Number(birthYearRaw) : null;
  if (isChild && birthYear !== null && (Number.isNaN(birthYear) || birthYear < 2000 || birthYear > new Date().getFullYear())) {
    return { error: "Please enter a valid birth year." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      error:
        "An account with that email already exists — sign in on your phone, or ask the front desk for help.",
    };
  }

  const source = (await isKioskEnabled()) ? "KIOSK" : "ONLINE";
  const pinHash = await bcrypt.hash(pin, 10);
  const password = `atheneum-${crypto.randomBytes(8).toString("hex")}`;

  const memberName = isChild ? childName : name;
  const created = await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({ data: { name: `${name} Household` } });
    const user = await tx.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        name,
        role: isChild ? "PARENT" : "MEMBER",
        householdId: household.id,
      },
    });
    const profile = await tx.memberProfile.create({
      data: {
        name: memberName,
        isChild,
        birthYear,
        householdId: household.id,
        ...(isChild ? {} : { userId: user.id }),
        pinHash,
        waiver: {
          create: {
            signedName,
            guardianName: isChild ? name : "",
            source,
            version: WAIVER_VERSION,
          },
        },
      },
    });
    return { user, profile };
  });

  await trackEvent("KIOSK_REGISTRATION", {
    userId: created.user.id,
    profileId: created.profile.id,
    metadata: source,
  });
  await recordAudit(KIOSK_ACTOR, "KIOSK_REGISTRATION", {
    targetType: "User",
    targetId: created.user.id,
    summary: `${memberName} self-registered (${source.toLowerCase()}) — waiver signed`,
  });

  await sendEmail(
    email,
    "Welcome to Atheneum Martial Arts",
    `
<p>Hi ${name.split(" ")[0]},</p>
<p>Thanks for registering at Atheneum Martial Arts — your waiver is signed and you're ready to train.</p>
<p><strong>Your member portal:</strong> <a href="${appUrl()}">${appUrl()}</a><br/>
To set your password: on the login page tap <strong>Forgot password?</strong>, enter this email, and follow the link we send you.</p>
<p>In the portal you can see the class schedule, book classes, track your attendance, and join the community board.</p>
<p>At the gym, check in on the front-desk iPad with ${isChild ? `${childName.split(" ")[0]}'s name` : "your name"} and your 4-digit PIN.</p>
<p>See you on the mats!<br/>Atheneum Martial Arts</p>
`
  );

  revalidatePath("/admin");
  return { success: { name: memberName } };
}

// ---------- Waiver management ----------

/** Admin records a waiver signed on paper or externally. */
export async function adminRecordWaiver(profileId: string, formData: FormData) {
  const admin = await requireAdmin();
  const signedName = String(formData.get("signedName") ?? "").trim();
  const guardianName = String(formData.get("guardianName") ?? "").trim();
  const memberPath = `/admin/member/${profileId}`;
  if (!signedName) {
    redirect(`${memberPath}?error=${encodeURIComponent("Enter the name as signed on the waiver.")}`);
  }
  const profile = await prisma.memberProfile.findUniqueOrThrow({ where: { id: profileId } });
  await prisma.waiverSignature.upsert({
    where: { profileId },
    create: { profileId, signedName, guardianName, source: "ADMIN", version: WAIVER_VERSION },
    update: { signedName, guardianName, source: "ADMIN", version: WAIVER_VERSION, signedAt: new Date() },
  });
  await recordAudit(admin, "WAIVER_RECORDED", {
    targetType: "MemberProfile",
    targetId: profileId,
    summary: `Recorded signed waiver for ${profile.name}`,
  });
  revalidatePath(memberPath);
  revalidatePath("/admin/waivers");
  redirect(`${memberPath}?success=${encodeURIComponent(`Waiver recorded for ${profile.name}.`)}`);
}

/** A signed-in member or parent signs the waiver for a profile in their household. */
export async function signOwnWaiver(profileId: string, formData: FormData) {
  const user = await requireUser();
  const signedName = String(formData.get("signedName") ?? "").trim();
  const agreed = formData.get("agree") === "on";
  if (!signedName || !agreed) {
    redirect(`/account?waiverError=${encodeURIComponent("Type your full name and tick the box to sign.")}`);
  }
  const profile = await prisma.memberProfile.findUnique({ where: { id: profileId } });
  if (!profile || profile.householdId !== user.householdId) redirect("/account");
  await prisma.waiverSignature.upsert({
    where: { profileId },
    create: {
      profileId,
      signedName,
      guardianName: profile.isChild ? user.name : "",
      source: "ONLINE",
      version: WAIVER_VERSION,
    },
    update: {
      signedName,
      guardianName: profile.isChild ? user.name : "",
      source: "ONLINE",
      version: WAIVER_VERSION,
      signedAt: new Date(),
    },
  });
  revalidatePath("/account");
  revalidatePath("/admin/waivers");
  redirect(`/account?waiverSigned=${encodeURIComponent(profile.name)}`);
}
