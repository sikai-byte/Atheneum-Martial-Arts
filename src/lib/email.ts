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
