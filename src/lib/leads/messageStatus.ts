/**
 * Outbound message states, in the order a send moves through them:
 *
 *   DRAFT    → an agent reply waiting for a coach; never sent on its own
 *   PENDING  → queued for delivery, provider not called yet
 *   SENDING  → a delivery attempt is in flight (claimed, so a second tick can't double-send)
 *   SENT     → the provider accepted it
 *   FAILED   → the provider rejected it; the row survives so staff can retry
 *   BLOCKED  → we refused to send it (opt-out, quiet hours, an unverifiable claim)
 *
 * Inbound messages are RECEIVED.
 *
 * These live apart from the outbox so the agent can ask "did the lead see this?" without importing
 * the sender it is called from.
 */
export const DELIVERED_STATUSES: string[] = ["SENT", "RECEIVED"];

/** Nothing reached the lead, and staff can put it back in the queue by hand. */
export const RETRYABLE_STATUSES: string[] = ["FAILED", "BLOCKED"];

/** Occupying the queue right now, so an identical text would be a double-send. */
export const IN_FLIGHT_STATUSES: string[] = ["PENDING", "SENDING"];

/** Outbound rows that exist but never reached the lead, so the thread must not imply they did. */
export const UNDELIVERED_STATUSES: string[] = ["PENDING", "SENDING", "FAILED", "BLOCKED"];

/** A provider that keeps erroring shouldn't be hammered; staff can still retry by hand. */
export const MAX_SEND_ATTEMPTS = 3;

export function wasDelivered(status: string): boolean {
  return DELIVERED_STATUSES.includes(status);
}
