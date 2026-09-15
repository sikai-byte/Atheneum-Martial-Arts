export const POST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const POST_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const MAX_POST_MEDIA = 5;
export const MAX_VIDEO_SECONDS = 60;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/**
 * Reads the duration of an ISO-BMFF video (MP4/MOV) from its mvhd box.
 * Returns null when the box can't be found (e.g. WebM).
 */
export function videoDurationSeconds(buffer: Buffer): number | null {
  const idx = buffer.indexOf("mvhd");
  if (idx < 0) return null;
  const version = buffer.readUInt8(idx + 4);
  if (version === 1) {
    if (idx + 36 > buffer.length) return null;
    const timescale = buffer.readUInt32BE(idx + 24);
    const duration = Number(buffer.readBigUInt64BE(idx + 28));
    return timescale > 0 ? duration / timescale : null;
  }
  if (idx + 24 > buffer.length) return null;
  const timescale = buffer.readUInt32BE(idx + 16);
  const duration = buffer.readUInt32BE(idx + 20);
  return timescale > 0 ? duration / timescale : null;
}
