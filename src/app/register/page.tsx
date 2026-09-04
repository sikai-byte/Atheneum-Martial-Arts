import RegisterForm from "@/components/RegisterForm";
import { WAIVER_PARAGRAPHS, WAIVER_TITLE } from "@/lib/waiver";

export const dynamic = "force-dynamic";

export const metadata = { title: "Register · Atheneum Martial Arts" };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-4">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Join Atheneum Martial Arts</h1>
        <p className="mt-2 text-lg text-stone-600">
          Quick sign-up for drop-ins, friends, and new members — takes under a minute.
        </p>
      </section>
      <RegisterForm waiverTitle={WAIVER_TITLE} waiverParagraphs={WAIVER_PARAGRAPHS} />
    </div>
  );
}
