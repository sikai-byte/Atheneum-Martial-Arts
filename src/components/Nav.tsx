"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";

const memberLinks = [
  { href: "/", label: "Home" },
  { href: "/schedule", label: "Schedule" },
  { href: "/coaches", label: "Coaches" },
  { href: "/community", label: "Community" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/progress", label: "Progress" },
  { href: "/shop", label: "Shop" },
];

const coachLinks = [
  { href: "/coach", label: "Today" },
  { href: "/schedule", label: "Schedule" },
  { href: "/coaches", label: "Coaches" },
  { href: "/community", label: "Community" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/coach/orders", label: "Orders" },
];

const adminLinks = [
  { href: "/admin", label: "Admin" },
  { href: "/coach", label: "Today" },
  { href: "/schedule", label: "Schedule" },
  { href: "/coaches", label: "Coaches" },
  { href: "/community", label: "Community" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/coach/orders", label: "Orders" },
];

export default function Nav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const links = role === "ADMIN" ? adminLinks : role === "COACH" ? coachLinks : memberLinks;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href={links[0].href} className="flex shrink-0 items-center gap-2">
            <Image src="/logo.png" alt="Atheneum Martial Arts" width={36} height={37} priority />
            <span className="text-lg font-bold tracking-tight text-brand">Atheneum</span>
          </Link>
          <div className="flex items-center gap-4">
            <nav className="hidden gap-1 lg:flex" aria-label="Primary">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-2.5 py-2 text-sm font-medium lg:px-3 ${
                    pathname === l.href
                      ? "bg-brand text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <Link
                href="/account"
                className={`hidden whitespace-nowrap text-sm lg:inline ${
                  pathname === "/account" ? "font-medium text-brand" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {name}
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="whitespace-nowrap rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-stone-200 bg-white lg:hidden"
        aria-label="Primary mobile"
      >
        {[...links, { href: "/account", label: "Me" }].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex-1 whitespace-nowrap px-3 py-4 text-center text-sm font-medium ${
              pathname === l.href ? "text-brand" : "text-stone-500"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
