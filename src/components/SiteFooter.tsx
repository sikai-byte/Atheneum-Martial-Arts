import Link from "next/link";
import { BUSINESS_ADDRESS, BUSINESS_NAME, BUSINESS_PHONE } from "@/lib/legal";

export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 text-center text-xs text-stone-500">
      <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href="/privacy" className="hover:text-stone-700 hover:underline">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-stone-700 hover:underline">
          Terms &amp; Refunds
        </Link>
        <Link href="/cookies" className="hover:text-stone-700 hover:underline">
          Cookies
        </Link>
      </nav>
      <p className="mt-2">
        © {new Date().getFullYear()} {BUSINESS_NAME} · {BUSINESS_ADDRESS} ·{" "}
        <a href="tel:+17633425614" className="whitespace-nowrap hover:text-stone-700 hover:underline">
          {BUSINESS_PHONE}
        </a>
      </p>
    </footer>
  );
}
