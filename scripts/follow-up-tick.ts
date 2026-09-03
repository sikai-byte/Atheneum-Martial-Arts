import "dotenv/config";
import { captureSnapshot } from "../src/lib/analytics/funnel";
import { getBotConfig } from "../src/lib/leads/config";
import { dispatchDueFollowUps } from "../src/lib/leads/engine";
import { ensureUpcomingSessions } from "../src/lib/schedule/rollout";

/**
 * One dispatcher tick from the command line, for schedulers that prefer running a command over
 * hitting the HTTP endpoint (`/api/cron/follow-ups`).
 */
async function main() {
  const sessionsCreated = await ensureUpcomingSessions();
  const summary = await dispatchDueFollowUps();
  const config = await getBotConfig();
  const snapshot = await captureSnapshot({ timezone: config.timezone });
  console.log(
    JSON.stringify({ ranAt: new Date().toISOString(), sessionsCreated, ...summary, snapshot }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
