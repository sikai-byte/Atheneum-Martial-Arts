import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatDay, formatTime } from "@/lib/format";
import { ensureUpcomingSessions } from "@/lib/scheduleGen";
import {
  createSlot,
  deleteSlot,
  setSessionStatus,
  updateSlot,
  updateTemplate,
} from "@/lib/adminContent";

export const dynamic = "force-dynamic";

const inputClass = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeValue(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function SlotFields({
  slot,
  templates,
  idPrefix,
}: {
  slot?: { templateId: string; dayOfWeek: number; hour: number; minute: number; instructor: string };
  templates: { id: string; name: string }[];
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div>
        <label htmlFor={`${idPrefix}-template`} className="mb-1 block text-xs font-medium">
          Class
        </label>
        <select
          id={`${idPrefix}-template`}
          name="templateId"
          defaultValue={slot?.templateId ?? ""}
          required
          className={inputClass}
        >
          {!slot && <option value="">Pick a class…</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-day`} className="mb-1 block text-xs font-medium">
          Day
        </label>
        <select
          id={`${idPrefix}-day`}
          name="dayOfWeek"
          defaultValue={slot?.dayOfWeek ?? 1}
          className={inputClass}
        >
          {dayNames.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-time`} className="mb-1 block text-xs font-medium">
          Start time
        </label>
        <input
          id={`${idPrefix}-time`}
          name="time"
          type="time"
          required
          defaultValue={slot ? timeValue(slot.hour, slot.minute) : ""}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-instructor`} className="mb-1 block text-xs font-medium">
          Instructor
        </label>
        <input
          id={`${idPrefix}-instructor`}
          name="instructor"
          maxLength={80}
          defaultValue={slot?.instructor ?? ""}
          placeholder="Atheneum Coaches"
          className={inputClass}
        />
      </div>
    </div>
  );
}

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireAdmin();
  await ensureUpcomingSessions();

  const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const [templates, slots, upcoming] = await Promise.all([
    prisma.classTemplate.findMany({
      where: { name: { not: { startsWith: "Private Trial" } } },
      include: { program: true },
      orderBy: { name: "asc" },
    }),
    prisma.recurringSlot.findMany({
      include: { template: true },
      orderBy: [{ dayOfWeek: "asc" }, { hour: "asc" }, { minute: "asc" }],
    }),
    prisma.classSession.findMany({
      where: {
        startsAt: { gte: new Date(), lte: twoWeeks },
        template: { name: { not: { startsWith: "Private Trial" } } },
      },
      include: { template: true, bookings: { where: { status: "BOOKED" } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          &larr; Back to Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Edit Schedule &amp; Classes</h1>
        <p className="mt-1 text-stone-600">
          Weekly time slots control which classes appear on the schedule each week. Class details
          control names, descriptions, and capacity.
        </p>
        {searchParams.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {searchParams.error}
          </p>
        )}
      </section>

      <section aria-labelledby="weekly-slots" className="space-y-4">
        <div>
          <h2 id="weekly-slots" className="text-lg font-semibold">
            Weekly time slots
          </h2>
          <p className="text-sm text-stone-600">
            Upcoming classes are created automatically from these slots. Pausing a slot stops new
            weeks from being added; already-scheduled classes stay until you cancel them below.
          </p>
        </div>
        {slots.map((slot) => (
          <article key={slot.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">
                {dayNames[slot.dayOfWeek]}{" "}
                {formatTime(new Date(2000, 0, 2 + slot.dayOfWeek, slot.hour, slot.minute))} —{" "}
                {slot.template.name}
              </h3>
              {!slot.active && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                  Paused
                </span>
              )}
            </div>
            <form action={updateSlot.bind(null, slot.id)} className="mt-3 space-y-3">
              <SlotFields slot={slot} templates={templates} idPrefix={`slot-${slot.id}`} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={slot.active}
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  Keep scheduling this class each week
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  Save changes
                </button>
              </div>
            </form>
            <form action={deleteSlot.bind(null, slot.id)} className="mt-2 text-right">
              <button type="submit" className="text-xs text-red-600 hover:underline">
                Delete this time slot
              </button>
            </form>
          </article>
        ))}
        <form
          action={createSlot}
          className="space-y-3 rounded-xl border border-dashed border-stone-300 bg-white p-4"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Add a weekly time slot
          </h3>
          <SlotFields templates={templates} idPrefix="new-slot" />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Add time slot
          </button>
        </form>
      </section>

      <section aria-labelledby="class-details" className="space-y-4">
        <div>
          <h2 id="class-details" className="text-lg font-semibold">
            Class details
          </h2>
          <p className="text-sm text-stone-600">
            Capacity is the number of spots members see. A few extra spots are quietly allowed
            before the waitlist starts.
          </p>
        </div>
        {templates.map((template) => (
          <article key={template.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{template.name}</h3>
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                {template.program.name}
              </span>
            </div>
            <form action={updateTemplate.bind(null, template.id)} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`tpl-${template.id}-name`}
                    className="mb-1 block text-xs font-medium"
                  >
                    Class name
                  </label>
                  <input
                    id={`tpl-${template.id}-name`}
                    name="name"
                    required
                    maxLength={120}
                    defaultValue={template.name}
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`tpl-${template.id}-age`}
                      className="mb-1 block text-xs font-medium"
                    >
                      Age group
                    </label>
                    <select
                      id={`tpl-${template.id}-age`}
                      name="ageGroup"
                      defaultValue={template.ageGroup}
                      className={inputClass}
                    >
                      <option value="ADULTS">Adults</option>
                      <option value="KIDS">Kids</option>
                      <option value="ALL">All ages</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`tpl-${template.id}-level`}
                      className="mb-1 block text-xs font-medium"
                    >
                      Level
                    </label>
                    <select
                      id={`tpl-${template.id}-level`}
                      name="level"
                      defaultValue={template.level}
                      className={inputClass}
                    >
                      <option value="BEGINNER">Beginner</option>
                      <option value="ALL">All levels</option>
                      <option value="ADVANCED">Advanced</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label
                    htmlFor={`tpl-${template.id}-capacity`}
                    className="mb-1 block text-xs font-medium"
                  >
                    Capacity (spots shown)
                  </label>
                  <input
                    id={`tpl-${template.id}-capacity`}
                    name="capacity"
                    type="number"
                    min={1}
                    max={100}
                    required
                    defaultValue={template.capacity}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`tpl-${template.id}-duration`}
                    className="mb-1 block text-xs font-medium"
                  >
                    Duration (min)
                  </label>
                  <input
                    id={`tpl-${template.id}-duration`}
                    name="durationMin"
                    type="number"
                    min={15}
                    max={240}
                    required
                    defaultValue={template.durationMin}
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2">
                  <label
                    htmlFor={`tpl-${template.id}-gear`}
                    className="mb-1 block text-xs font-medium"
                  >
                    Gear notes
                  </label>
                  <input
                    id={`tpl-${template.id}-gear`}
                    name="gearNotes"
                    maxLength={300}
                    defaultValue={template.gearNotes}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor={`tpl-${template.id}-description`}
                  className="mb-1 block text-xs font-medium"
                >
                  Description
                </label>
                <textarea
                  id={`tpl-${template.id}-description`}
                  name="description"
                  rows={2}
                  maxLength={500}
                  defaultValue={template.description}
                  className={inputClass}
                />
              </div>
              <div className="text-right">
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  Save changes
                </button>
              </div>
            </form>
          </article>
        ))}
      </section>

      <section aria-labelledby="upcoming-sessions" className="space-y-3">
        <div>
          <h2 id="upcoming-sessions" className="text-lg font-semibold">
            Upcoming classes (next 2 weeks)
          </h2>
          <p className="text-sm text-stone-600">
            Cancel a single class (e.g. for a holiday) without changing the weekly schedule.
          </p>
        </div>
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
          {upcoming.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {session.template.name}
                  {session.status === "CANCELLED" && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                      Cancelled
                    </span>
                  )}
                </p>
                <p className="text-xs text-stone-500">
                  {formatDay(session.startsAt)} · {formatTime(session.startsAt)} ·{" "}
                  {session.bookings.length} booked
                </p>
              </div>
              <form
                action={setSessionStatus.bind(
                  null,
                  session.id,
                  session.status === "CANCELLED" ? "SCHEDULED" : "CANCELLED"
                )}
              >
                <button
                  type="submit"
                  className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
                >
                  {session.status === "CANCELLED" ? "Restore" : "Cancel class"}
                </button>
              </form>
            </li>
          ))}
          {upcoming.length === 0 && (
            <li className="px-4 py-3 text-sm text-stone-500">No upcoming classes found.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
