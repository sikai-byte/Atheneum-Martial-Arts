import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  impersonatorId?: string;
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set in production.");
    }
    return "dev-only-insecure-session-secret-change-me";
  }
  return secret;
}

export const sessionOptions: SessionOptions = {
  password: sessionSecret(),
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
