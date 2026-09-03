import Link from "next/link";
import BotSettingsForm from "@/components/leads/BotSettingsForm";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBotConfig } from "@/lib/leads/config";
import { llmConfigured } from "@/lib/leads/investigate";
import { ghlConfigured } from "@/lib/leads/ghl";
import { activeSmsProvider, twilioConfigured } from "@/lib/leads/sms";

export const dynamic = "force-dynamic";

export default async function BotSettingsPage() {
  await requireCoach();
  const [config, sequences] = await Promise.all([
    getBotConfig(),
    prisma.sequence.findMany({
      include: { steps: { orderBy: { order: "asc" } } },
      orderBy: { key: "asc" },
    }),
  ]);

  const provider = activeSmsProvider();

  const integrations = [
    {
      name: "HighLevel / Gymnetics SMS",
      ready: ghlConfigured(),
      detail: ghlConfigured()
        ? "Texts go out through the studio's existing HighLevel number. Add a workflow webhook on inbound messages pointing at /api/webhooks/ghl/inbound?secret=GHL_WEBHOOK_SECRET so replies pause follow-up."
        : "Set GHL_API_TOKEN (private integration token) and GHL_LOCATION_ID to text from the number already on the Gymnetics sub-account.",
    },
    {
      name: "Twilio SMS",
      ready: twilioConfigured(),
      detail:
        provider === "GHL" && twilioConfigured()
          ? "Configured but unused: HighLevel takes priority while its token is set."
          : twilioConfigured()
            ? "Texts are delivered through Twilio."
            : "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER (or TWILIO_MESSAGING_SERVICE_SID). Point the number's inbound webhook at /api/webhooks/twilio/sms.",
    },
    {
      name: "Facebook Lead Ads",
      ready: Boolean(process.env.FB_VERIFY_TOKEN && process.env.FB_PAGE_ACCESS_TOKEN),
      detail:
        "Set FB_VERIFY_TOKEN, FB_APP_SECRET and FB_PAGE_ACCESS_TOKEN, then subscribe the page's leadgen webhook to /api/webhooks/facebook.",
    },
    {
      name: "AI investigation",
      ready: llmConfigured(),
      detail: llmConfigured()
        ? "Leads are qualified by the LLM, with the rules engine as fallback."
        : "Set OPENAI_API_KEY or ANTHROPIC_API_KEY for AI qualification. Until then the rules engine scores leads.",
    },
    {
      name: "Dispatcher cron",
      ready: Boolean(process.env.CRON_SECRET),
      detail:
        "Call /api/cron/follow-ups every minute (Bearer CRON_SECRET). This is the backstop for the 5-minute first-text promise.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach/leads" className="text-sm text-brand hover:underline">
          ← Leads
        </Link>
        <h1 className="page-title mt-2">Bot settings</h1>
      </div>

      <Link
        href="/coach/leads/knowledge"
        className="block card p-4 hover:bg-slate-50"
      >
        <p className="font-semibold">What the agent knows →</p>
        <p className="mt-1 text-sm text-slate-600">
          Programs, prices, policies, objections and upsell paths. The agent can only state facts
          from here, so this is where you correct it.
        </p>
      </Link>

      <div className="card p-4">
        <BotSettingsForm settings={config} />
      </div>

      <section className="card p-4">
        <h2 className="card-title">Cadences</h2>
        <p className="mt-1 text-sm text-slate-600">
          Message templates live in the database, so they can be reworded without a code change.
        </p>
        <div className="mt-3 space-y-4">
          {sequences.map((sequence) => (
            <div key={sequence.key}>
              <p className="text-sm font-semibold">{sequence.name}</p>
              <p className="text-sm text-slate-600">{sequence.purpose}</p>
              <ol className="mt-2 space-y-2 text-sm">
                {sequence.steps.map((step) => (
                  <li key={step.id} className="rounded-lg bg-slate-50 p-3">
                    <p className="eyebrow">
                      Step {step.order} ·{" "}
                      {step.delayMinutes === 0
                        ? "immediately"
                        : step.delayMinutes < 60
                          ? `${step.delayMinutes} min later`
                          : step.delayMinutes < 1440
                            ? `${Math.round(step.delayMinutes / 60)} h later`
                            : `${Math.round(step.delayMinutes / 1440)} days later`}
                      {step.goal && ` · ${step.goal}`}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{step.template}</p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="card-title">Integrations</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {integrations.map((integration) => (
            <li key={integration.name}>
              <p className="font-medium">
                {integration.name}{" "}
                <span className={integration.ready ? "text-emerald-700" : "text-amber-700"}>
                  {integration.ready ? "· connected" : "· not configured"}
                </span>
              </p>
              <p className="text-slate-600">{integration.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
