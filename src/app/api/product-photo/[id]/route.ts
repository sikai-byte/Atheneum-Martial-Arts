import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { uploadsDir } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const image = await prisma.productImage.findUnique({ where: { id: params.id } });
  if (!image) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await fs.readFile(path.join(uploadsDir(), `product-image-${image.id}`));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
