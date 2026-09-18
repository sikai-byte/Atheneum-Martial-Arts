import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { uploadsDir } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const media = await prisma.postMedia.findUnique({ where: { id: params.id } });
  if (!media) return new NextResponse("Not found", { status: 404 });

  const filePath = path.join(uploadsDir(), `postmedia-${media.id}`);
  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": media.mimeType,
    "Cache-Control": "private, max-age=300",
    "Accept-Ranges": "bytes",
  };

  // Range support so <video> seeking works (Safari requires it).
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match && (match[1] || match[2])) {
      const start = match[1] ? parseInt(match[1], 10) : data.length - parseInt(match[2], 10);
      const end = match[1] && match[2] ? Math.min(parseInt(match[2], 10), data.length - 1) : data.length - 1;
      if (start >= 0 && start <= end && start < data.length) {
        return new NextResponse(new Uint8Array(data.subarray(start, end + 1)), {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${data.length}`,
            "Content-Length": String(end - start + 1),
          },
        });
      }
      return new NextResponse("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${data.length}` },
      });
    }
  }

  return new NextResponse(new Uint8Array(data), {
    headers: { ...baseHeaders, "Content-Length": String(data.length) },
  });
}
