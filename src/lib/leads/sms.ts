import { ghlConfigured, sendGhlSms } from "./ghl";

export type SmsProvider = "GHL" | "TWILIO" | "MOCK";

export type SmsResult =
  | { ok: true; provider: SmsProvider; providerId: string | null }
  | { ok: false; provider: SmsProvider; error: string };

export type SmsContact = { name?: string; email?: string | null };

export function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER),
  );
}

/** Which provider a send would use right now, for the settings page and staff warnings. */
export function activeSmsProvider(): SmsProvider {
  if (ghlConfigured()) return "GHL";
  if (twilioConfigured()) return "TWILIO";
  return "MOCK";
}

/**
 * Sends an SMS through HighLevel (the studio's existing CRM number) when configured, otherwise
 * Twilio. Without either the studio can still run the whole follow-up flow: messages are recorded
 * as sent by the MOCK provider and logged, so cadences, quiet hours, and the staff inbox are all
 * exercisable before go-live.
 */
export async function sendSms(to: string, body: string, contact: SmsContact = {}): Promise<SmsResult> {
  const provider = activeSmsProvider();

  if (provider === "MOCK") {
    console.info(`[sms:mock] -> ${to}: ${body}`);
    return { ok: true, provider: "MOCK", providerId: null };
  }

  if (provider === "GHL") {
    const result = await sendGhlSms({ phone: to, body, name: contact.name, email: contact.email });
    return result.ok
      ? { ok: true, provider: "GHL", providerId: result.providerId }
      : { ok: false, provider: "GHL", error: result.error };
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
