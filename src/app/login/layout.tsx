import { redirect } from "next/navigation";
import { isKioskEnabled } from "@/lib/kiosk";

export const dynamic = "force-dynamic";

// A device in kiosk mode always lands on the kiosk screen instead of sign-in.
export default async function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (await isKioskEnabled()) redirect("/kiosk");
  return <>{children}</>;
}
