/** Age in whole years as of `now`, derived from the date of birth. */
export function ageFromBirthDate(birthDate: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayPassed =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age;
}

/** Formats a date of birth for display, e.g. "Mar 14, 2014". */
export function formatBirthDate(birthDate: Date): string {
  return birthDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Parses a yyyy-mm-dd form value into a UTC date of birth; null when invalid. */
export function parseBirthDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  if (date.getTime() > now.getTime()) return null;
  if (date.getUTCFullYear() < now.getUTCFullYear() - 120) return null;
  return date;
}
