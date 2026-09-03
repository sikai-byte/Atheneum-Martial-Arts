import { prisma } from "./db";

export type TelemetryType =
  | "LOGIN"
  | "SELF_BOOKING"
  | "ADMIN_BOOKING"
  | "SELF_CANCELLATION"
  | "ADMIN_CANCELLATION"
  | "WAITLIST_PROMOTION"
  | "AUTOMATED_EMAIL"
  | "SELF_PASSWORD_RESET"
  | "TRIAL_STARTED"
  | "TRIAL_CONVERTED"
  | "KIOSK_CHECKIN"
  | "KIOSK_REGISTRATION";

/** Records a telemetry event. Best-effort: never throws, so instrumented flows can't fail because of analytics. */
export async function trackEvent(
  type: TelemetryType,
  opts: { userId?: string; profileId?: string; metadata?: string } = {}
): Promise<void> {
  try {
    await prisma.telemetryEvent.create({
      data: {
        type,
        userId: opts.userId ?? null,
        profileId: opts.profileId ?? null,
        metadata: opts.metadata ?? "",
      },
    });
  } catch (err) {
    console.error("[telemetry] failed to record event:", err);
  }
}

/** Estimated minutes of front-desk/admin time each self-serve or automated action replaces. */
export const MINUTES_SAVED: Record<TelemetryType, number> = {
  LOGIN: 0,
  SELF_BOOKING: 3,
  ADMIN_BOOKING: 0,
  SELF_CANCELLATION: 3,
  ADMIN_CANCELLATION: 0,
  WAITLIST_PROMOTION: 5,
  AUTOMATED_EMAIL: 4,
  SELF_PASSWORD_RESET: 10,
  TRIAL_STARTED: 0,
  TRIAL_CONVERTED: 0,
  KIOSK_CHECKIN: 2,
  KIOSK_REGISTRATION: 10,
};

export const TIME_SAVED_LABELS: Partial<Record<TelemetryType, string>> = {
  SELF_BOOKING: "Self-serve bookings",
  SELF_CANCELLATION: "Self-serve cancellations",
  WAITLIST_PROMOTION: "Automatic waitlist promotions",
  AUTOMATED_EMAIL: "Automated emails",
  SELF_PASSWORD_RESET: "Self-serve password resets",
  KIOSK_CHECKIN: "Kiosk self check-ins",
  KIOSK_REGISTRATION: "Kiosk self-registrations",
};

/** Event types that replace a manual text, email, or phone call. */
export const MESSAGE_SAVING_TYPES: TelemetryType[] = [
  "WAITLIST_PROMOTION",
  "AUTOMATED_EMAIL",
];
