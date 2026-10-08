// Classes advertise `capacity` spots publicly but accept bookings up to
// `capacity + OVERBOOK_BUFFER` before waitlisting, to absorb no-shows.
export const OVERBOOK_BUFFER = 4;

export function bookingLimit(capacity: number): number {
  return capacity + OVERBOOK_BUFFER;
}
