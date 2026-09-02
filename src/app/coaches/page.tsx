import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Coach = {
  name: string;
  disciplines: string[];
  bio: string;
  photoUrl?: string;
};

const mainCoaches: Coach[] = [
  {
    name: "Coach DJ",
    disciplines: ["Judo", "Gi BJJ", "Kids Judo"],
    bio: "Coach DJ leads our Judo and Gi BJJ programs, bringing a throw-first, position-second approach to the mats. He loves building fundamentals with the kids' Judo class and sharpening grip fighting with the adults.",
  },
  {
    name: "Coach Jair",
    disciplines: ["No-Gi BJJ", "BJJ Comp Training", "Kids BJJ"],
    bio: "Coach Jair runs our No-Gi BJJ and competition training programs. If you're chasing medals, his comp class is where you level up — and he brings the same energy to our kids' BJJ program.",
  },
  {
    name: "Coach Shannon",
    disciplines: ["Muay Thai", "Fitness Kickboxing", "Kids Muay Thai"],
    bio: "Coach Shannon heads up Muay Thai and Fitness Kickboxing. Whether you're here to fight or to sweat, her pad rounds will push you — and the kids' Muay Thai class is one of the most fun hours in the gym.",
  },
  {
    name: "Coach Kazim",
    disciplines: ["MMA", "Kids MMA"],
    bio: "Coach Kazim leads our MMA program, blending striking, wrestling, and grappling into complete mixed martial arts training for adults and kids alike.",
  },
  {
    name: "Coach Trey",
    disciplines: ["Muay Thai", "No-Gi BJJ", "Kids BJJ"],
    bio: "Coach Trey splits his time between Muay Thai and No-Gi BJJ, and helps coach our kids' BJJ classes. Expect crisp technique and plenty of rounds.",
  },
  {
    name: "Coach Sikai",
    disciplines: ["Gi & No-Gi BJJ", "Muay Thai", "Kids BJJ", "Kids Muay Thai"],
    bio: "Coach Sikai teaches across our Gi and No-Gi BJJ and Muay Thai programs, and coaches both kids' BJJ and kids' Muay Thai. Train for life — your only limit is your tribe.",
  },
];

const assistantCoaches = [
  "Assistant Coach Jacob",
  "Assistant Coach Reese",
  "Assistant Coach James",
  "Assistant Coach Blake",
];

function initials(name: string) {
  const parts = name.replace(/^(Assistant )?Coach /, "").split(" ");
  const letters =
    parts.length === 1 ? parts[0].slice(0, 2) : parts.map((part) => part[0]).slice(0, 2).join("");
  return letters.toUpperCase();
}

export default async function CoachesPage() {
  await requireUser();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Our Coaches</h1>
        <p className="mt-1 text-stone-600">
          The team behind every class at Atheneum Martial Arts.
        </p>
      </section>

      <section aria-label="Main coaches" className="space-y-4">
        {mainCoaches.map((coach) => (
          <article
            key={coach.name}
            className="flex gap-4 rounded-xl border border-stone-200 bg-white p-4"
          >
            {coach.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coach.photoUrl}
                alt={coach.name}
                className="h-20 w-20 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xl font-bold text-brand">
                {initials(coach.name)}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{coach.name}</h2>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {coach.disciplines.map((d) => (
                  <li
                    key={d}
                    className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600"
                  >
                    {d}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-stone-600">{coach.bio}</p>
            </div>
          </article>
        ))}
      </section>

      <section aria-label="Assistant coaches">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Assistant Coaches
        </h2>
        <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {assistantCoaches.map((name) => (
            <li
              key={name}
              className="flex flex-col items-center gap-2 rounded-xl border border-stone-200 bg-white p-4 text-center"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-lg font-bold text-brand">
                {initials(name)}
              </span>
              <span className="text-sm font-medium">
                {name.replace("Assistant Coach", "Coach")}
              </span>
              <span className="text-xs text-stone-500">Assistant Coach</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
