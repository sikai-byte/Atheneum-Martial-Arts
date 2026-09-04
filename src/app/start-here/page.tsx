import Link from "next/link";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Step = { title: string; body: string; href: string; linkLabel: string };

const memberSteps: Step[] = [
  {
    title: "Book your first class",
    body: "Browse the weekly schedule, tap a class that fits, and book your spot. If a class is full you'll join the waitlist and get moved in automatically when a spot opens.",
    href: "/schedule",
    linkLabel: "Open the schedule",
  },
  {
    title: "Set your check-in PIN and sign your waiver",
    body: "Your 4-digit PIN lets you check in on the front-desk iPad when you arrive. While you're there, make sure your liability waiver is signed.",
    href: "/account",
    linkLabel: "Go to My account",
  },
  {
    title: "Track your progress",
    body: "Every check-in counts toward your weekly goal, your attendance history, and your milestones. See how you're trending any time.",
    href: "/progress",
    linkLabel: "See your progress",
  },
  {
    title: "Climb the leaderboard",
    body: "Attendance earns your place on the monthly and all-time leaderboards. Consistency is the whole game.",
    href: "/leaderboard",
    linkLabel: "View the leaderboard",
  },
  {
    title: "Join the community",
    body: "Share wins, photos, and questions with the rest of the gym on the community board.",
    href: "/community",
    linkLabel: "Visit the community",
  },
  {
    title: "Grab your gear",
    body: "Order Atheneum gear from the shop and pick it up at the front desk.",
    href: "/shop",
    linkLabel: "Browse the shop",
  },
];

const parentSteps: Step[] = [
  {
    title: "Book your kids into classes",
    body: "The schedule has a Kids view — pick a class, choose which child is going, and book. Full classes use a waitlist that promotes automatically.",
    href: "/schedule",
    linkLabel: "Open the schedule",
  },
  {
    title: "Set each child's check-in PIN and sign waivers",
    body: "Each child gets their own 4-digit PIN so they can check themselves in on the front-desk iPad. Waivers for everyone in your household are signed here too.",
    href: "/account",
    linkLabel: "Go to My account",
  },
  {
    title: "Follow their progress",
    body: "Check-ins feed each child's weekly goal, attendance history, and milestones — see how they're doing any time.",
    href: "/progress",
    linkLabel: "See progress",
  },
  {
    title: "Watch the leaderboard",
    body: "Kids earn leaderboard spots through attendance — a great motivator on the drive to the gym.",
    href: "/leaderboard",
    linkLabel: "View the leaderboard",
  },
  {
    title: "Join the community",
    body: "Announcements from the coaches land on your home page, and the community board is where the gym shares photos and wins.",
    href: "/community",
    linkLabel: "Visit the community",
  },
  {
    title: "Grab gear for the family",
    body: "Order gear from the shop and pick it up at the front desk.",
    href: "/shop",
    linkLabel: "Browse the shop",
  },
];

const coachSteps: Step[] = [
  {
    title: "Run today's classes",
    body: "Your Today page lists every class on the calendar. Tap one to see who's booked and check members in with one tap — check-ins drive attendance, streaks, punch passes, and the leaderboard.",
    href: "/coach",
    linkLabel: "Open Today",
  },
  {
    title: "Manage rosters",
    body: "From any class you can add a member who showed up without booking, or remove someone who isn't coming.",
    href: "/coach",
    linkLabel: "Go to your classes",
  },
  {
    title: "Post announcements",
    body: "Announcements you post from the Today page appear on every member's home screen.",
    href: "/coach",
    linkLabel: "Post an announcement",
  },
  {
    title: "Fulfill shop orders",
    body: "When members order gear, it shows up in Orders — mark items ready and delivered as you hand them out.",
    href: "/coach/orders",
    linkLabel: "View orders",
  },
  {
    title: "Keep an eye on the community",
    body: "You can post and moderate on the community board like any member.",
    href: "/community",
    linkLabel: "Visit the community",
  },
];

const adminSteps: Step[] = [
  {
    title: "Everything coaches can do",
    body: "Your account includes all coach tools — Today's classes, one-tap check-in, roster add/remove, announcements, and order fulfillment.",
    href: "/coach",
    linkLabel: "Open Today",
  },
  {
    title: "Manage members",
    body: "Create accounts, set memberships and punch passes, start trials, reset passwords, and handle leavers from the Admin dashboard. Use \u201cView portal as\u201d on any member page to see exactly what they see.",
    href: "/admin",
    linkLabel: "Open Admin",
  },
  {
    title: "Watch the numbers",
    body: "Analytics covers weekly active members, booking adoption, retention and churn, and absence outreach lists. Member activity shows who has actually signed in.",
    href: "/admin/analytics",
    linkLabel: "Open Analytics",
  },
  {
    title: "Run the front desk",
    body: "Turn the iPad into the check-in kiosk, print the walk-in QR poster, and track who has a signed waiver on file.",
    href: "/admin/kiosk",
    linkLabel: "Kiosk setup",
  },
  {
    title: "Edit site content",
    body: "Coaches, shop products (with photos and inventory), and the class schedule are all editable from Admin.",
    href: "/admin",
    linkLabel: "Edit content",
  },
  {
    title: "Review the audit trail",
    body: "Every admin and coach action is recorded in Audit history.",
    href: "/admin/audit",
    linkLabel: "View audit history",
  },
];

export default async function StartHerePage() {
  const user = await requireUser();
  const steps =
    user.role === "ADMIN"
      ? adminSteps
      : user.role === "COACH"
        ? coachSteps
        : user.role === "PARENT"
          ? parentSteps
          : memberSteps;
  const intro =
    user.role === "ADMIN"
      ? "Here's a quick tour of the admin side of the portal."
      : user.role === "COACH"
        ? "Here's a quick tour of your coaching tools."
        : user.role === "PARENT"
          ? "Here's how to manage your family's training from the portal."
          : "Here's how to get the most out of the portal.";

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Start here</h1>
        <p className="mt-1 text-stone-600">
          Welcome, {user.name.split(" ")[0]}! {intro}
        </p>
      </section>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={step.title} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold">{step.title}</h2>
                <p className="mt-1 text-sm text-stone-600">{step.body}</p>
                <Link
                  href={step.href}
                  className="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
                >
                  {step.linkLabel} &rarr;
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <section className="rounded-xl border border-stone-200 bg-stone-50 p-5">
        <h2 className="font-semibold">Spot something off?</h2>
        <p className="mt-1 text-sm text-stone-600">
          The portal is new and your feedback shapes it. Anything confusing, broken, or missing —
          send it straight to the team.
        </p>
        <Link
          href="/feedback"
          className="mt-3 inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Send feedback
        </Link>
      </section>
    </div>
  );
}
