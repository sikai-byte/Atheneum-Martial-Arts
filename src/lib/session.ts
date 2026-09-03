import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  impersonatorId?: string;
}

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ?? "dev-only-insecure-session-secret-change-me",
  cookieName: "atheneum_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}
