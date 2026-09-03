"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireAdmin } from "./auth";
import { recordAudit } from "./audit";
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
  const admin = await requireAdmin();
  const data = coachFields(formData);
  const coach = await prisma.coachProfile.create({ data });
  await recordAudit(admin, "COACH_CREATED", {
    targetType: "CoachProfile",
    targetId: coach.id,
    summary: `Added coach ${data.name}`,
  });
  revalidateCoaches();
  doneTo("/admin/coaches", `${data.name} added.`);
}

export async function updateCoach(coachId: string, formData: FormData) {
  const admin = await requireAdmin();
  const active = formData.get("active") === "on";
  const data = coachFields(formData);
  await prisma.coachProfile.update({
    where: { id: coachId },
    data: { ...data, active },
  });
  await recordAudit(admin, "COACH_UPDATED", {
    targetType: "CoachProfile",
    targetId: coachId,
    summary: `Edited coach ${data.name}${active ? "" : " (hidden)"}`,
  });
  revalidateCoaches();
  doneTo("/admin/coaches", `${data.name} saved.`);
}

export async function deleteCoach(coachId: string) {
  const admin = await requireAdmin();
  const coach = await prisma.coachProfile.delete({ where: { id: coachId } });
  await fs.rm(path.join(uploadsDir(), `coach-${coachId}`), { force: true });
  await recordAudit(admin, "COACH_DELETED", {
    targetType: "CoachProfile",
    targetId: coachId,
    summary: `Deleted coach ${coach.name}`,
  });
  revalidateCoaches();
  doneTo("/admin/coaches", `${coach.name} deleted.`);
}

export async function updateCoachPhoto(coachId: string, formData: FormData) {
  const admin = await requireAdmin();
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
  await recordAudit(admin, "COACH_PHOTO_UPDATED", {
    targetType: "CoachProfile",
    targetId: coachId,
    summary: `Updated photo for ${coach.name}`,
  });
  revalidateCoaches();
  doneTo("/admin/coaches", `Photo saved for ${coach.name}.`);
}

export async function removeCoachPhoto(coachId: string) {
  const admin = await requireAdmin();
  await fs.rm(path.join(uploadsDir(), `coach-${coachId}`), { force: true });
  const coach = await prisma.coachProfile.update({
    where: { id: coachId },
    data: { photoType: "", photoUpdatedAt: null },
  });
  await recordAudit(admin, "COACH_PHOTO_REMOVED", {
    targetType: "CoachProfile",
    targetId: coachId,
    summary: `Removed photo for ${coach.name}`,
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
  const admin = await requireAdmin();
  const data = productFields(formData);
  const product = await prisma.product.create({ data });
  await recordAudit(admin, "PRODUCT_CREATED", {
    targetType: "Product",
    targetId: product.id,
    summary: `Added ${data.name} ($${(data.priceCents / 100).toFixed(2)})`,
  });
  revalidateShop();
  doneTo("/admin/shop", `${data.name} added to the shop.`);
}

export async function updateProduct(productId: string, formData: FormData) {
  const admin = await requireAdmin();
  const active = formData.get("active") === "on";
  const data = productFields(formData);
  await prisma.product.update({
    where: { id: productId },
    data: { ...data, active },
  });
  await recordAudit(admin, "PRODUCT_UPDATED", {
    targetType: "Product",
    targetId: productId,
    summary: `Edited ${data.name} ($${(data.priceCents / 100).toFixed(2)})${active ? "" : " (retired)"}`,
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
  const admin = await requireAdmin();
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
  await recordAudit(admin, "CLASS_UPDATED", {
    targetType: "ClassTemplate",
    targetId: templateId,
    summary: `Edited class ${name} (capacity ${capacity}, ${durationMin} min)`,
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
  const admin = await requireAdmin();
  const data = slotFields(formData);
  const template = await prisma.classTemplate.findUniqueOrThrow({
    where: { id: data.templateId },
  });
  const slot = await prisma.recurringSlot.create({ data });
  await recordAudit(admin, "SLOT_CREATED", {
    targetType: "RecurringSlot",
    targetId: slot.id,
    summary: `Added weekly slot for ${template.name}`,
  });
  revalidateSchedule();
  doneTo("/admin/schedule", "Weekly time slot added.");
}

export async function updateSlot(slotId: string, formData: FormData) {
  const admin = await requireAdmin();
  const data = slotFields(formData);
  const active = formData.get("active") === "on";
  const template = await prisma.classTemplate.findUniqueOrThrow({
    where: { id: data.templateId },
  });
  await prisma.recurringSlot.update({ where: { id: slotId }, data: { ...data, active } });
  await recordAudit(admin, "SLOT_UPDATED", {
    targetType: "RecurringSlot",
    targetId: slotId,
    summary: `Edited weekly slot for ${template.name}${active ? "" : " (paused)"}`,
  });
  revalidateSchedule();
  doneTo("/admin/schedule", "Time slot saved.");
}

export async function deleteSlot(slotId: string) {
  const admin = await requireAdmin();
  const slot = await prisma.recurringSlot.delete({
    where: { id: slotId },
    include: { template: true },
  });
  await recordAudit(admin, "SLOT_DELETED", {
    targetType: "RecurringSlot",
    targetId: slotId,
    summary: `Removed weekly slot for ${slot.template.name}`,
  });
  revalidateSchedule();
  doneTo("/admin/schedule", "Time slot removed.");
}

export async function setSessionStatus(sessionId: string, status: string) {
  const admin = await requireAdmin();
  if (!["SCHEDULED", "CANCELLED"].includes(status)) {
    failTo("/admin/schedule", "Invalid session status.");
  }
  const session = await prisma.classSession.update({
    where: { id: sessionId },
    data: { status },
    include: { template: true },
  });
  await recordAudit(admin, status === "CANCELLED" ? "SESSION_CANCELLED" : "SESSION_RESTORED", {
    targetType: "ClassSession",
    targetId: sessionId,
    summary: `${status === "CANCELLED" ? "Cancelled" : "Restored"} a ${session.template.name} session`,
  });
  revalidateSchedule();
  doneTo(
    "/admin/schedule",
    status === "CANCELLED" ? "Session cancelled." : "Session restored."
  );
}
