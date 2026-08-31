export type SmsResult =
  | { ok: true; provider: "TWILIO" | "MOCK"; providerId: string | null }
  | { ok: false; provider: "TWILIO" | "MOCK"; error: string };

export function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER),
  );
}

/**
 * Sends an SMS through Twilio when credentials are present. Without credentials the studio can
 * still run the whole follow-up flow: messages are recorded as sent by the MOCK provider and
 * logged, so cadences, quiet hours, and the staff inbox are all exercisable before go-live.
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!twilioConfigured()) {
    console.info(`[sms:mock] -> ${to}: ${body}`);
    return { ok: true, provider: "MOCK", providerId: null };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const params = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    params.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    params.set("From", process.env.TWILIO_PHONE_NUMBER!);
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );
    const payload = (await response.json()) as { sid?: string; message?: string };
    if (!response.ok) {
      return {
        ok: false,
        provider: "TWILIO",
        error: payload.message ?? `Twilio responded ${response.status}`,
      };
    }
    return { ok: true, provider: "TWILIO", providerId: payload.sid ?? null };
  } catch (error) {
    return {
      ok: false,
      provider: "TWILIO",
      error: error instanceof Error ? error.message : "Unknown Twilio error",
    };
  }
}
