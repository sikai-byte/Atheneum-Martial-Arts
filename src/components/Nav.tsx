"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";

const memberLinks = [
  { href: "/", label: "Home" },
  { href: "/schedule", label: "Schedule" },
  { href: "/progress", label: "Progress" },
];

const coachLinks = [
  { href: "/coach", label: "Today" },
  { href: "/schedule", label: "Schedule" },
];

export default function Nav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const links = role === "COACH" || role === "ADMIN" ? coachLinks : memberLinks;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href={links[0].href} className="text-lg font-bold tracking-tight">
            Atheneum
          </Link>
          <div className="flex items-center gap-4">
            <nav className="hidden gap-1 sm:flex" aria-label="Primary">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${
                    pathname === l.href
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-stone-500 sm:inline">{name}</span>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-stone-200 bg-white sm:hidden"
        aria-label="Primary mobile"
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex-1 py-4 text-center text-sm font-medium ${
              pathname === l.href ? "text-stone-900" : "text-stone-500"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
