import { bookClass, cancelBooking } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

type Profile = { id: string; name: string; isChild: boolean };
type BookingInfo = { profileId: string; status: string };

export default function BookingControls({
  sessionId,
  profiles,
  bookings,
  isFull,
  inPast,
}: {
  sessionId: string;
  profiles: Profile[];
  bookings: BookingInfo[];
  isFull: boolean;
  inPast: boolean;
}) {
  if (inPast) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {profiles.map((profile) => {
        const booking = bookings.find((b) => b.profileId === profile.id);
        const active = booking && booking.status !== "CANCELLED";
        const label = profiles.length > 1 ? profile.name : "You";

        if (active) {
          return (
            <form key={profile.id} action={cancelBooking.bind(null, profile.id, sessionId)}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-emerald-700">
                  {booking.status === "WAITLISTED"
                    ? `${label}: on the waitlist`
                    : `${label}: booked`}
                </span>
                <SubmitButton
                  pendingLabel="Cancelling…"
                  className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
                >
                  Cancel
                </SubmitButton>
              </div>
            </form>
          );
        }

        return (
          <form key={profile.id} action={bookClass.bind(null, profile.id, sessionId, "/schedule")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-stone-600">{label}</span>
              <SubmitButton
                pendingLabel="Booking…"
                className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                {isFull ? "Join waitlist" : "Book"}
              </SubmitButton>
            </div>
          </form>
        );
      })}
    </div>
  );
}
