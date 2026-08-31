import "dotenv/config";
import { dispatchDueFollowUps } from "../src/lib/leads/engine";

/**
 * One dispatcher tick from the command line, for schedulers that prefer running a command over
 * hitting the HTTP endpoint (`/api/cron/follow-ups`).
 */
async function main() {
  const summary = await dispatchDueFollowUps();
  console.log(JSON.stringify({ ranAt: new Date().toISOString(), ...summary }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
