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

export function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function coachInitials(name: string) {
  const parts = name.replace(/^(Assistant )?Coach /, "").split(" ");
  const letters =
    parts.length === 1 ? parts[0].slice(0, 2) : parts.map((part) => part[0]).slice(0, 2).join("");
  return letters.toUpperCase();
}

export const programColors: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800",
  red: "bg-red-100 text-red-800",
  purple: "bg-purple-100 text-purple-800",
  green: "bg-green-100 text-green-800",
  stone: "bg-stone-100 text-stone-800",
};
