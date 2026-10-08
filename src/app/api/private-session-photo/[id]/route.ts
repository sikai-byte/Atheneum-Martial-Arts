import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, householdProfiles } from "@/lib/auth";
import { uploadsDir } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const session = await prisma.privateSession.findUnique({ where: { id: params.id } });
  if (!session || !session.photoType) return new NextResponse("Not found", { status: 404 });

  const isStaff = user.role === "COACH" || user.role === "ADMIN";
  const ownProfile = householdProfiles(user).some((p) => p.id === session.profileId);
  if (!isStaff && !ownProfile) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await fs.readFile(path.join(uploadsDir(), `private-${session.id}`));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": session.photoType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
