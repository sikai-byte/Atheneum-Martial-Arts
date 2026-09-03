/**
 * Everything the studio reads is in studio time. Without this the server renders in its own zone —
 * UTC on Railway — so a Friday 6:15pm class reads as Saturday 00:15 to the coach looking at it, and
 * a trial card can disagree with the text that booked it.
 */
const STUDIO_TZ = process.env.NEXT_PUBLIC_STUDIO_TIMEZONE || "America/Chicago";

export function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: STUDIO_TZ,
  });
}

export function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: STUDIO_TZ,
  });
}

export function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: STUDIO_TZ,
  });
}

/** "just now", "12 min ago", "3 days ago", "in 2 h" — for lead timelines and queued follow-ups. */
export function formatRelative(date: Date, now = new Date()) {
  const diffMs = date.getTime() - now.getTime();
  const future = diffMs > 0;
  const minutes = Math.round(Math.abs(diffMs) / 60_000);
  if (minutes < 1) return "just now";

  let value = minutes;
  let unit = "min";
  if (minutes >= 60 * 24) {
    value = Math.round(minutes / (60 * 24));
    unit = value === 1 ? "day" : "days";
  } else if (minutes >= 60) {
    value = Math.round(minutes / 60);
    unit = "h";
  }
  return future ? `in ${value} ${unit}` : `${value} ${unit} ago`;
}

export function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function startOfWeek(date: Date) {
  // Weeks are the server's, not the studio's: this only buckets "classes this week", where being an
  // hour off at the boundary is invisible, and shifting it per-zone would break the DB comparisons.
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export const programColors: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800",
  red: "bg-red-100 text-red-800",
  purple: "bg-purple-100 text-purple-800",
  green: "bg-green-100 text-green-800",
  stone: "bg-slate-100 text-slate-700",
};
