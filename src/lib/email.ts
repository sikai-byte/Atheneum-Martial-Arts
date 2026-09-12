import { trackEvent } from "./telemetry";

const FROM = process.env.EMAIL_FROM ?? "Atheneum Martial Arts <onboarding@resend.dev>";

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // On a deployed environment, refuse rather than pretend the email was sent.
    if (process.env.RAILWAY_ENVIRONMENT) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    // Local development fallback: print the email so flows can be exercised without a key.
    console.log(`[email] RESEND_API_KEY not set — would send to ${to}: ${subject}\n${html}`);
    await trackEvent("AUTOMATED_EMAIL", { metadata: subject });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Email send failed (${res.status}): ${detail}`);
  }
  await trackEvent("AUTOMATED_EMAIL", { metadata: subject });
}

const BRAND_WRAP = (inner: string) =>
  `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#0039b7">Atheneum Martial Arts</h2>
    ${inner}
  </div>`;

export async function sendTrialWelcomeEmail(
  to: string,
  firstName: string,
  password: string,
  trialEndsAt: Date
): Promise<void> {
  const endDate = trialEndsAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  await sendEmail(
    to,
    "Welcome to Atheneum Martial Arts — your trial is ready",
    BRAND_WRAP(
      `<p>Hi ${firstName}, your trial account is ready! Your trial runs through <strong>${endDate}</strong>.</p>
      <p style="margin:24px 0">
        <a href="${appUrl()}/login" style="background:#0039b7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Sign in to the portal</a>
      </p>
      <p>Login: <strong>${to}</strong><br/>Temporary password: <strong>${password}</strong></p>
      <p style="color:#666;font-size:14px">After signing in, you can change your password from the My account page. See you on the mats!</p>`
    )
  );
}

export async function sendTrialBookingEmail(
  to: string,
  firstName: string,
  className: string,
  startsAt: Date
): Promise<void> {
  const day = startsAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const time = startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  await sendEmail(
    to,
    `Your class is booked: ${className}`,
    BRAND_WRAP(
      `<p>Hi ${firstName}, you're booked for <strong>${className}</strong> on <strong>${day}</strong> at <strong>${time}</strong>.</p>
      <p style="margin:24px 0">
        <a href="${appUrl()}" style="background:#0039b7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">View it in the portal</a>
      </p>
      <p style="color:#666;font-size:14px">825 Meander Court, Medina, MN 55340 · (763) 342-5614</p>`
    )
  );
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendEmail(
    to,
    "Reset your Atheneum Martial Arts password",
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#0039b7">Atheneum Martial Arts</h2>
      <p>We received a request to reset your portal password.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#0039b7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Reset password</a>
      </p>
      <p style="color:#666;font-size:14px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    </div>`
  );
}
