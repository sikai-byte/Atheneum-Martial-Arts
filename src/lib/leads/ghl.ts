const API_BASE = "https://services.leadconnectorhq.com";
const CONTACTS_VERSION = "2021-07-28";
const CONVERSATIONS_VERSION = "2021-04-15";

export function ghlConfigured() {
  return Boolean(process.env.GHL_API_TOKEN && process.env.GHL_LOCATION_ID);
}

function headers(version: string) {
  return {
    Authorization: `Bearer ${process.env.GHL_API_TOKEN!}`,
    Version: version,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(payload.message) ? payload.message.join("; ") : payload.message;
    return message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * HighLevel addresses messages by contact, not phone number, so a lead has to exist as a contact
 * before it can be texted. Upsert honours the sub-account's duplicate rules, so an existing
 * contact is reused rather than duplicated — the studio keeps one conversation thread per person.
 */
export async function upsertContact(input: {
  phone: string;
  name?: string;
  email?: string | null;
}): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${API_BASE}/contacts/upsert`, {
      method: "POST",
      headers: headers(CONTACTS_VERSION),
      body: JSON.stringify({
        locationId: process.env.GHL_LOCATION_ID,
        phone: input.phone,
        ...(input.name ? { name: input.name } : {}),
        ...(input.email ? { email: input.email } : {}),
        source: "Atheneum follow-up bot",
      }),
    });
    if (!response.ok) {
      return { ok: false, error: await readError(response, `HighLevel responded ${response.status}`) };
    }
    const payload = (await response.json()) as { contact?: { id?: string } };
    const contactId = payload.contact?.id;
    if (!contactId) return { ok: false, error: "HighLevel did not return a contact id" };
    return { ok: true, contactId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown HighLevel error",
    };
  }
}

export async function sendGhlSms(input: {
  phone: string;
  body: string;
  name?: string;
  email?: string | null;
}): Promise<{ ok: true; providerId: string | null } | { ok: false; error: string }> {
  const contact = await upsertContact(input);
  if (!contact.ok) return contact;

  try {
    const response = await fetch(`${API_BASE}/conversations/messages`, {
      method: "POST",
      headers: headers(CONVERSATIONS_VERSION),
      body: JSON.stringify({
        type: "SMS",
        contactId: contact.contactId,
        message: input.body,
        ...(process.env.GHL_FROM_NUMBER ? { fromNumber: process.env.GHL_FROM_NUMBER } : {}),
      }),
    });
    if (!response.ok) {
      return { ok: false, error: await readError(response, `HighLevel responded ${response.status}`) };
    }
    const payload = (await response.json()) as { messageId?: string };
    return { ok: true, providerId: payload.messageId ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown HighLevel error",
    };
  }
}
