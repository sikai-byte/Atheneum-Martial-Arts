import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { sessionSecret } from "./session";

export interface KioskData {
  enabled?: boolean;
}

const kioskOptions: SessionOptions = {
  password: sessionSecret(),
  cookieName: "atheneum_kiosk",
  ttl: 60 * 60 * 24 * 365,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  },
};

export async function getKioskSession(): Promise<IronSession<KioskData>> {
  return getIronSession<KioskData>(cookies(), kioskOptions);
}

export async function isKioskEnabled(): Promise<boolean> {
  const kiosk = await getKioskSession();
  return Boolean(kiosk.enabled);
}
