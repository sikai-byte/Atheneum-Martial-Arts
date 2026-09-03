const statusStyles: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-amber-100 text-amber-800",
  ENGAGED: "bg-emerald-100 text-emerald-800",
  BOOKED: "bg-emerald-600 text-white",
  WON: "bg-brand text-white",
  LOST: "bg-slate-200 text-slate-700",
  UNSUBSCRIBED: "bg-red-100 text-red-800",
};

const temperatureStyles: Record<string, string> = {
  HOT: "bg-red-100 text-red-800",
  WARM: "bg-amber-100 text-amber-800",
  COLD: "bg-sky-100 text-sky-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        statusStyles[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {status.toLowerCase()}
    </span>
  );
}

export function TemperatureBadge({
  temperature,
  score,
}: {
  temperature: string;
  score?: number;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        temperatureStyles[temperature] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {temperature.toLowerCase()}
      {typeof score === "number" ? ` · ${score}` : ""}
    </span>
  );
}
