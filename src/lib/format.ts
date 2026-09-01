export function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
  stone: "bg-stone-100 text-stone-800",
};
