"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateBotConfigAction, type FormState } from "@/lib/leadActions";

type Settings = {
  studioName: string;
  signature: string;
  timezone: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  autopilot: boolean;
  autoReplyEnabled: boolean;
  bookingLink: string;
  agentEnabled: boolean;
  agentMode: string;
  agentPersona: string;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

const inputClass = "w-full rounded-lg border border-stone-300 px-3 py-2";
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number) {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}

export default function BotSettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useFormState<FormState, FormData>(updateBotConfigAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="studioName" className="mb-1 block text-sm font-medium">
            Studio name
          </label>
          <input
            id="studioName"
            name="studioName"
            defaultValue={settings.studioName}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="timezone" className="mb-1 block text-sm font-medium">
            Timezone
          </label>
          <input
            id="timezone"
            name="timezone"
            defaultValue={settings.timezone}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="quietHoursStart" className="mb-1 block text-sm font-medium">
            No automated texts after
          </label>
          <select
            id="quietHoursStart"
            name="quietHoursStart"
            defaultValue={String(settings.quietHoursStart)}
            className={inputClass}
          >
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="quietHoursEnd" className="mb-1 block text-sm font-medium">
            …until
          </label>
          <select
            id="quietHoursEnd"
            name="quietHoursEnd"
            defaultValue={String(settings.quietHoursEnd)}
            className={inputClass}
          >
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="bookingLink" className="mb-1 block text-sm font-medium">
            Trial booking link
          </label>
          <input
            id="bookingLink"
            name="bookingLink"
            defaultValue={settings.bookingLink}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="signature" className="mb-1 block text-sm font-medium">
            Signature
          </label>
          <input
            id="signature"
            name="signature"
            defaultValue={settings.signature}
            className={inputClass}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-stone-200 p-3">
        <input
          type="checkbox"
          name="autopilot"
          defaultChecked={settings.autopilot}
          className="mt-1"
        />
        <span className="text-sm">
          <span className="font-medium">Autopilot</span>
          <span className="block text-stone-600">
            Send queued follow-ups automatically. Turn off to hold everything for manual review —
            nothing is lost, texts just wait.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-lg border border-stone-200 p-3">
        <input
          type="checkbox"
          name="autoReplyEnabled"
          defaultChecked={settings.autoReplyEnabled}
          className="mt-1"
        />
        <span className="text-sm">
          <span className="font-medium">Instant acknowledgement</span>
          <span className="block text-stone-600">
            When a lead replies, text back immediately so they aren&apos;t left waiting for a coach.
          </span>
        </span>
      </label>

      <fieldset className="space-y-3 rounded-lg border border-stone-200 p-3">
        <legend className="px-1 text-sm font-semibold">Sales agent</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="agentEnabled"
            defaultChecked={settings.agentEnabled}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">Let the agent write replies</span>
            <span className="block text-stone-600">
              It answers questions, handles objections and offers real class times from the
              knowledge base. Off means leads get a short acknowledgement and wait for a coach.
            </span>
          </span>
        </label>

        <div>
          <label htmlFor="agentMode" className="mb-1 block text-sm font-medium">
            Before a reply goes out
          </label>
          <select
            id="agentMode"
            name="agentMode"
            defaultValue={settings.agentMode}
            className={inputClass}
          >
            <option value="DRAFT">A coach approves every message (recommended to start)</option>
            <option value="AUTOPILOT">Send by itself, except when it asks for a human</option>
          </select>
        </div>

        <div>
          <label htmlFor="agentPersona" className="mb-1 block text-sm font-medium">
            Who the agent is
          </label>
          <textarea
            id="agentPersona"
            name="agentPersona"
            rows={2}
            defaultValue={settings.agentPersona}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-stone-500">
            Name and tone. Leads will assume this is a person, so use a real coach&apos;s name only
            if that coach is happy to be the one texting.
          </p>
        </div>
      </fieldset>

      {state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.message}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  );
}
