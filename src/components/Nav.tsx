"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

type NavLink = { href: string; label: string; icon: keyof typeof icons };

const icons = {
  home: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
    />
  ),
  calendar: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
    />
  ),
  chat: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
    />
  ),
  trophy: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"
    />
  ),
  clock: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  shield: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  ),
  users: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
    />
  ),
  chart: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
    />
  ),
  bag: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
    />
  ),
  clipboard: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
    />
  ),
  user: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
    />
  ),
  dots: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm6 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm6 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
    />
  ),
};

function NavIcon({ icon, className }: { icon: keyof typeof icons; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className={className ?? "h-6 w-6"}
      aria-hidden="true"
    >
      {icons[icon]}
    </svg>
  );
}

const memberPrimary: NavLink[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/schedule", label: "Schedule", icon: "calendar" },
  { href: "/community", label: "Community", icon: "chat" },
  { href: "/leaderboard", label: "Ranks", icon: "trophy" },
];
const memberMore: NavLink[] = [
  { href: "/progress", label: "Progress", icon: "chart" },
  { href: "/shop", label: "Shop", icon: "bag" },
  { href: "/coaches", label: "Coaches", icon: "users" },
  { href: "/account", label: "My account", icon: "user" },
];

const coachPrimary: NavLink[] = [
  { href: "/coach", label: "Today", icon: "clock" },
  { href: "/schedule", label: "Schedule", icon: "calendar" },
  { href: "/community", label: "Community", icon: "chat" },
  { href: "/coach/orders", label: "Orders", icon: "clipboard" },
];
const coachMore: NavLink[] = [
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
  { href: "/coaches", label: "Coaches", icon: "users" },
  { href: "/account", label: "My account", icon: "user" },
];

const adminPrimary: NavLink[] = [
  { href: "/admin", label: "Admin", icon: "shield" },
  { href: "/coach", label: "Today", icon: "clock" },
  { href: "/schedule", label: "Schedule", icon: "calendar" },
  { href: "/community", label: "Community", icon: "chat" },
];
const adminMore: NavLink[] = [
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
  { href: "/coach/orders", label: "Orders", icon: "clipboard" },
  { href: "/coaches", label: "Coaches", icon: "users" },
  { href: "/account", label: "My account", icon: "user" },
];

const desktopLinks: Record<string, { href: string; label: string }[]> = {
  MEMBER: [
    { href: "/", label: "Home" },
    { href: "/schedule", label: "Schedule" },
    { href: "/coaches", label: "Coaches" },
    { href: "/community", label: "Community" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/progress", label: "Progress" },
    { href: "/shop", label: "Shop" },
  ],
  COACH: [
    { href: "/coach", label: "Today" },
    { href: "/schedule", label: "Schedule" },
    { href: "/coaches", label: "Coaches" },
    { href: "/community", label: "Community" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/coach/orders", label: "Orders" },
  ],
  ADMIN: [
    { href: "/admin", label: "Admin" },
    { href: "/coach", label: "Today" },
    { href: "/schedule", label: "Schedule" },
    { href: "/coaches", label: "Coaches" },
    { href: "/community", label: "Community" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/coach/orders", label: "Orders" },
  ],
};

export default function Nav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const links = desktopLinks[role] ?? desktopLinks.MEMBER;
  const primary =
    role === "ADMIN" ? adminPrimary : role === "COACH" ? coachPrimary : memberPrimary;
  const more = role === "ADMIN" ? adminMore : role === "COACH" ? coachMore : memberMore;

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const moreActive = more.some((l) => pathname === l.href);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href={links[0].href} className="flex shrink-0 items-center gap-2">
            <Image src="/logo.png" alt="Atheneum Martial Arts" width={36} height={37} priority />
            <span className="text-lg font-bold tracking-wide text-brand">ATHENEUM</span>
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
                <SubmitButton
                  pendingLabel="Signing out…"
                  className="whitespace-nowrap rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
                >
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      </header>
      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-10 bg-black/40 lg:hidden"
        />
      )}
      {moreOpen && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 mx-3 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl lg:hidden">
          {more.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMoreOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium ${
                pathname === l.href ? "bg-brand/10 text-brand" : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              <NavIcon icon={l.icon} className="h-6 w-6" />
              {l.label}
            </Link>
          ))}
        </div>
      )}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary mobile"
      >
        {primary.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setMoreOpen(false)}
            className={`flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium ${
              pathname === l.href && !moreOpen ? "text-brand" : "text-stone-500"
            }`}
          >
            <NavIcon icon={l.icon} />
            {l.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={`flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium ${
            moreOpen || moreActive ? "text-brand" : "text-stone-500"
          }`}
        >
          <NavIcon icon="dots" />
          More
        </button>
      </nav>
    </>
  );
}
