import path from "path";
import fs from "fs/promises";

export function uploadsDir() {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

export async function ensureUploadsDir() {
  await fs.mkdir(uploadsDir(), { recursive: true });
}
