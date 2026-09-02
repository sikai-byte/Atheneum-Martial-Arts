"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireAdmin } from "./auth";
import { ensureUploadsDir, uploadsDir } from "./uploads";

function failTo(target: string, message: string): never {
  redirect(`${target}?error=${encodeURIComponent(message)}`);
}

function doneTo(target: string, message: string): never {
  redirect(`${target}?ok=${encodeURIComponent(message)}`);
}

function revalidateCoaches() {
  revalidatePath("/coaches");
  revalidatePath("/admin/coaches");
}

const COACH_ROLES = ["MAIN", "ASSISTANT"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

function coachFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const role = String(formData.get("role") ?? "MAIN");
  const disciplines = String(formData.get("disciplines") ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(",");
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 1000);
  const sortOrder = Number(formData.get("sortOrder") ?? 0) || 0;
  if (!name) failTo("/admin/coaches", "Please add the coach's name.");
  if (!COACH_ROLES.includes(role)) failTo("/admin/coaches", "Invalid coach role.");
  return { name, role, disciplines, bio, sortOrder };
}

export async function createCoach(formData: FormData) {
  await requireAdmin();
  const data = coachFields(formData);
  await prisma.coachProfile.create({ data });
  revalidateCoaches();
  doneTo("/admin/coaches", `${data.name} added.`);
}

export async function updateCoach(coachId: string, formData: FormData) {
  await requireAdmin();
  const active = formData.get("active") === "on";
  const data = coachFields(formData);
  await prisma.coachProfile.update({
    where: { id: coachId },
    data: { ...data, active },
  });
  revalidateCoaches();
  doneTo("/admin/coaches", `${data.name} saved.`);
}

export async function deleteCoach(coachId: string) {
  await requireAdmin();
  const coach = await prisma.coachProfile.delete({ where: { id: coachId } });
  await fs.rm(path.join(uploadsDir(), `coach-${coachId}`), { force: true });
  revalidateCoaches();
  doneTo("/admin/coaches", `${coach.name} deleted.`);
}

export async function updateCoachPhoto(coachId: string, formData: FormData) {
  await requireAdmin();
  const file = formData.get("photo");
  if (!(file instanceof Blob) || file.size === 0) {
    failTo("/admin/coaches", "Please choose a photo.");
  }
  if (file.size > 8 * 1024 * 1024) {
    failTo("/admin/coaches", "Photo is too large — please use one under 8 MB.");
  }
  if (!PHOTO_TYPES.includes(file.type)) {
    failTo("/admin/coaches", "Please use a JPEG, PNG, or WebP photo.");
  }

  await ensureUploadsDir();
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadsDir(), `coach-${coachId}`), buffer);
  const coach = await prisma.coachProfile.update({
    where: { id: coachId },
    data: { photoType: file.type, photoUpdatedAt: new Date() },
  });
  revalidateCoaches();
  doneTo("/admin/coaches", `Photo saved for ${coach.name}.`);
}

export async function removeCoachPhoto(coachId: string) {
  await requireAdmin();
  await fs.rm(path.join(uploadsDir(), `coach-${coachId}`), { force: true });
  const coach = await prisma.coachProfile.update({
    where: { id: coachId },
    data: { photoType: "", photoUpdatedAt: null },
  });
  revalidateCoaches();
  doneTo("/admin/coaches", `Photo removed for ${coach.name}.`);
}

function revalidateShop() {
  revalidatePath("/shop");
  revalidatePath("/admin/shop");
}

const PRODUCT_CATEGORIES = [
  "MOUTHGUARD",
  "RASHGUARD",
  "TSHIRT",
  "SHORTS",
  "GI",
  "GLOVES",
  "SHINGUARDS",
  "OTHER",
];

function productFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const description = String(formData.get("description") ?? "").trim().slice(0, 500);
  const category = String(formData.get("category") ?? "OTHER");
  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = Number(priceRaw);
  const sizes = String(formData.get("sizes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join(",");
  const sortOrder = Number(formData.get("sortOrder") ?? 0) || 0;
  if (!name) failTo("/admin/shop", "Please add a product name.");
  if (!PRODUCT_CATEGORIES.includes(category)) failTo("/admin/shop", "Invalid category.");
  if (!priceRaw || Number.isNaN(price) || price < 0 || price > 10000) {
    failTo("/admin/shop", "Please enter a price between $0 and $10,000.");
  }
  return { name, description, category, priceCents: Math.round(price * 100), sizes, sortOrder };
}

export async function createProduct(formData: FormData) {
  await requireAdmin();
  const data = productFields(formData);
  await prisma.product.create({ data });
  revalidateShop();
  doneTo("/admin/shop", `${data.name} added to the shop.`);
}

export async function updateProduct(productId: string, formData: FormData) {
  await requireAdmin();
  const active = formData.get("active") === "on";
  const data = productFields(formData);
  await prisma.product.update({
    where: { id: productId },
    data: { ...data, active },
  });
  revalidateShop();
  doneTo("/admin/shop", `${data.name} saved.`);
}

function revalidateSchedule() {
  revalidatePath("/schedule");
  revalidatePath("/admin/schedule");
  revalidatePath("/");
}

const AGE_GROUPS = ["ADULTS", "KIDS", "ALL"];
const LEVELS = ["BEGINNER", "ALL", "ADVANCED"];

export async function updateTemplate(templateId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const description = String(formData.get("description") ?? "").trim().slice(0, 500);
  const ageGroup = String(formData.get("ageGroup") ?? "ADULTS");
  const level = String(formData.get("level") ?? "ALL");
  const capacity = Number(formData.get("capacity") ?? 0);
  const durationMin = Number(formData.get("durationMin") ?? 0);
  const gearNotes = String(formData.get("gearNotes") ?? "").trim().slice(0, 300);
  if (!name) failTo("/admin/schedule", "Please add a class name.");
  if (!AGE_GROUPS.includes(ageGroup) || !LEVELS.includes(level)) {
    failTo("/admin/schedule", "Invalid age group or level.");
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    failTo("/admin/schedule", "Capacity must be between 1 and 100.");
  }
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 240) {
    failTo("/admin/schedule", "Duration must be between 15 and 240 minutes.");
  }
  await prisma.classTemplate.update({
    where: { id: templateId },
    data: { name, description, ageGroup, level, capacity, durationMin, gearNotes },
  });
  revalidateSchedule();
  doneTo("/admin/schedule", `${name} saved.`);
}

function slotFields(formData: FormData) {
  const templateId = String(formData.get("templateId") ?? "");
  const dayOfWeek = Number(formData.get("dayOfWeek") ?? -1);
  const timeRaw = String(formData.get("time") ?? "");
  const instructor =
    String(formData.get("instructor") ?? "").trim().slice(0, 80) || "Atheneum Coaches";
  const match = /^(\d{2}):(\d{2})$/.exec(timeRaw);
  if (!templateId) failTo("/admin/schedule", "Please pick a class.");
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    failTo("/admin/schedule", "Please pick a day.");
  }
  if (!match) failTo("/admin/schedule", "Please pick a time.");
  return {
    templateId,
    dayOfWeek,
    hour: Number(match[1]),
    minute: Number(match[2]),
    instructor,
  };
}

export async function createSlot(formData: FormData) {
  await requireAdmin();
  const data = slotFields(formData);
  await prisma.classTemplate.findUniqueOrThrow({ where: { id: data.templateId } });
  await prisma.recurringSlot.create({ data });
  revalidateSchedule();
  doneTo("/admin/schedule", "Weekly time slot added.");
}

export async function updateSlot(slotId: string, formData: FormData) {
  await requireAdmin();
  const data = slotFields(formData);
  const active = formData.get("active") === "on";
  await prisma.classTemplate.findUniqueOrThrow({ where: { id: data.templateId } });
  await prisma.recurringSlot.update({ where: { id: slotId }, data: { ...data, active } });
  revalidateSchedule();
  doneTo("/admin/schedule", "Time slot saved.");
}

export async function deleteSlot(slotId: string) {
  await requireAdmin();
  await prisma.recurringSlot.delete({ where: { id: slotId } });
  revalidateSchedule();
  doneTo("/admin/schedule", "Time slot removed.");
}

export async function setSessionStatus(sessionId: string, status: string) {
  await requireAdmin();
  if (!["SCHEDULED", "CANCELLED"].includes(status)) {
    failTo("/admin/schedule", "Invalid session status.");
  }
  await prisma.classSession.update({ where: { id: sessionId }, data: { status } });
  revalidateSchedule();
  doneTo(
    "/admin/schedule",
    status === "CANCELLED" ? "Session cancelled." : "Session restored."
  );
}
