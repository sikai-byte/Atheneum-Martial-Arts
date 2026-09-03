"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";

const memberLinks = [
  { href: "/", label: "Home" },
  { href: "/schedule", label: "Schedule" },
  { href: "/community", label: "Community" },
  { href: "/progress", label: "Progress" },
  { href: "/shop", label: "Shop" },
];

const coachLinks = [
  { href: "/coach", label: "Today" },
  { href: "/schedule", label: "Schedule" },
  { href: "/coach/leads", label: "Leads" },
  { href: "/coach/members", label: "Members" },
  { href: "/coach/growth", label: "Growth" },
  { href: "/community", label: "Community" },
  { href: "/coach/orders", label: "Orders" },
];

const adminLinks = [
  { href: "/admin", label: "Admin" },
  { href: "/coach", label: "Today" },
  { href: "/schedule", label: "Schedule" },
  { href: "/coach/leads", label: "Leads" },
  { href: "/coach/members", label: "Members" },
  { href: "/community", label: "Community" },
  { href: "/coach/orders", label: "Orders" },
];

const SHELL = "mx-auto w-full max-w-3xl px-4 lg:max-w-5xl";

export default function Nav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const links = role === "ADMIN" ? adminLinks : role === "COACH" ? coachLinks : memberLinks;
  const isCurrent = (href: string) => pathname === href;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className={`${SHELL} flex h-16 items-center gap-4`}>
          <Link href={links[0].href} className="flex shrink-0 items-center gap-2">
            <Image src="/logo.png" alt="Atheneum Martial Arts" width={32} height={33} priority />
            <span className="font-display text-lg font-bold uppercase tracking-[0.08em] text-brand">
              Atheneum
            </span>
          </Link>

          {/* Wide screens fit the full nav inline; narrower ones get the scrolling strip below. */}
          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex"
            aria-label="Primary"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isCurrent(l.href) ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isCurrent(l.href)
                    ? "bg-brand text-white"
                    : "text-slate-600 hover:bg-brand-tint hover:text-brand-dark"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3 lg:ml-0">
            <Link
              href="/account"
              aria-current={isCurrent("/account") ? "page" : undefined}
              className={`hidden max-w-[10rem] truncate text-sm sm:inline ${
                isCurrent("/account")
                  ? "font-medium text-brand"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {name}
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="hidden border-t border-slate-100 sm:block lg:hidden">
          <nav
            className={`${SHELL} flex gap-0.5 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
            aria-label="Primary compact"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isCurrent(l.href) ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isCurrent(l.href)
                    ? "bg-brand text-white"
                    : "text-slate-600 hover:bg-brand-tint hover:text-brand-dark"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Phones: fixed bar that scrolls sideways rather than squeezing labels until they clip. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
        aria-label="Primary mobile"
      >
        {[...links, { href: "/account", label: "Me" }].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isCurrent(l.href) ? "page" : undefined}
            className={`flex min-w-[4.5rem] flex-1 items-center justify-center whitespace-nowrap px-3 py-3.5 text-center text-[0.8125rem] font-medium ${
              isCurrent(l.href)
                ? "border-t-2 border-brand -mt-px text-brand"
                : "text-slate-500"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
