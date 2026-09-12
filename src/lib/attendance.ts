export const LATE_BUFFER_MS = 5 * 60 * 1000;

/** A check-in is late when it happens more than 5 minutes after class start. */
export function isLateCheckIn(classStartsAt: Date, checkedInAt: Date = new Date()): boolean {
  return checkedInAt.getTime() > classStartsAt.getTime() + LATE_BUFFER_MS;
}

/** A check-in recorded after the class has ended is a retroactive backfill. */
export function isBackfillCheckIn(
  classStartsAt: Date,
  durationMin: number,
  checkedInAt: Date = new Date()
): boolean {
  return checkedInAt.getTime() > classStartsAt.getTime() + durationMin * 60000;
}
