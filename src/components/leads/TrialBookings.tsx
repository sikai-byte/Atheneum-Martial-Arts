"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  bookTrialAction,
  cancelTrialAction,
  markTrialAttendanceAction,
  type FormState,
} from "@/lib/leadActions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Booking…" : "Book them in"}
    </button>
  );
}

/** Trials the lead is booked into, plus the coach's own way to put them in a class. */
export default function TrialBookings({
  leadId,
  bookings,
  classes,
}: {
  leadId: string;
  bookings: {
    id: string;
    label: string;
    status: string;
    bookedBy: string;
    inPast: boolean;
  }[];
  classes: { id: string; label: string }[];
}) {
  const [state, formAction] = useFormState<FormState, FormData>(
    bookTrialAction.bind(null, leadId),
    {},
  );

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="font-semibold">Trial classes</h2>
      {bookings.length === 0 ? (
        <p className="mt-1 text-sm text-stone-600">Not booked into a class yet.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {bookings.map((booking) => (
            <li key={booking.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className={booking.status === "CANCELLED" ? "text-stone-400 line-through" : ""}>
                {booking.label}
                <span className="ml-2 text-xs text-stone-500">booked by {booking.bookedBy}</span>
              </span>
              {booking.status === "BOOKED" && !booking.inPast && (
                <form action={cancelTrialAction.bind(null, leadId, booking.id)}>
                  <button type="submit" className="text-xs text-stone-500 underline hover:text-stone-700">
                    Cancel
                  </button>
                </form>
              )}
              {/* Whether they turned up is the one funnel number nothing can infer. */}
              {booking.status === "BOOKED" && booking.inPast && (
                <span className="flex items-center gap-3">
                  <form action={markTrialAttendanceAction.bind(null, leadId, booking.id, true)}>
                    <button type="submit" className="text-xs font-medium text-green-700 underline">
                      Showed up
                    </button>
                  </form>
                  <form action={markTrialAttendanceAction.bind(null, leadId, booking.id, false)}>
                    <button type="submit" className="text-xs text-stone-500 underline hover:text-stone-700">
                      No-show
                    </button>
                  </form>
                </span>
              )}
              {(booking.status === "ATTENDED" || booking.status === "NO_SHOW") && (
                <span className="text-xs text-stone-500">
                  {booking.status === "ATTENDED" ? "attended" : "no-show"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {classes.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">No upcoming classes on the schedule to book.</p>
      ) : (
        <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
          <select
            name="sessionId"
            defaultValue=""
            className="min-w-64 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            <option value="">Pick a class…</option>
            {classes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <Submit />
        </form>
      )}
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </section>
  );
}
