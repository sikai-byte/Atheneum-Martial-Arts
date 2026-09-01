import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import PwaRegister from "@/components/PwaRegister";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Atheneum Martial Arts",
  description: "Member portal for Atheneum Martial Arts — Train for Life.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Atheneum", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0039b7",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-stone-50 font-sans text-stone-900 antialiased`}
      >
        <PwaRegister />
        {user && <Nav name={user.name} role={user.role} />}
        <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:pb-10">
          {children}
        </main>
      </body>
    </html>
  );
}
