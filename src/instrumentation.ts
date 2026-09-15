export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { startBackupSchedule } = await import("./lib/backup");
    startBackupSchedule();
    const { startRetentionSchedule } = await import("./lib/leavers");
    startRetentionSchedule();
    const { startReminderSchedule, startClassReminderSchedule } = await import("./lib/reminders");
    startReminderSchedule();
    startClassReminderSchedule();
    const { startFeedbackDigestSchedule } = await import("./lib/feedbackDigest");
    startFeedbackDigestSchedule();
  }
}
