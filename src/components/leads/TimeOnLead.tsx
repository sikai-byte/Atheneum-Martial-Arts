"use client";

import { useEffect } from "react";

const FLUSH_EVERY_MS = 60_000;
const IDLE_AFTER_MS = 120_000;

/**
 * Counts the seconds a coach is genuinely working a lead: the tab has to be visible and there has
 * to have been input in the last two minutes, so a lead page left open overnight adds nothing.
 * Flushes every minute and again when the page goes away, because most visits end by navigation.
 */
export default function TimeOnLead({ leadId }: { leadId: string }) {
  useEffect(() => {
    let activeMs = 0;
    let lastTick = Date.now();
    let lastInput = Date.now();

    const markInput = () => {
      lastInput = Date.now();
    };

    const accrue = () => {
      const now = Date.now();
      const elapsed = now - lastTick;
      lastTick = now;
      if (document.visibilityState === "visible" && now - lastInput < IDLE_AFTER_MS) {
        activeMs += elapsed;
      }
    };

    const flush = (useBeacon: boolean) => {
      accrue();
      const seconds = Math.round(activeMs / 1000);
      if (seconds < 5) return;
      activeMs = 0;
      const payload = JSON.stringify({ leadId, seconds });
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/coach/lead-time", new Blob([payload], { type: "application/json" }));
        return;
      }
      void fetch("/api/coach/lead-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    };

    const ticker = window.setInterval(() => flush(false), FLUSH_EVERY_MS);
    const onHide = () => flush(true);

    for (const event of ["mousemove", "keydown", "click", "scroll", "touchstart"]) {
      window.addEventListener(event, markInput, { passive: true });
    }
    document.addEventListener("visibilitychange", accrue);
    window.addEventListener("pagehide", onHide);

    return () => {
      window.clearInterval(ticker);
      for (const event of ["mousemove", "keydown", "click", "scroll", "touchstart"]) {
        window.removeEventListener(event, markInput);
      }
      document.removeEventListener("visibilitychange", accrue);
      window.removeEventListener("pagehide", onHide);
      flush(true);
    };
  }, [leadId]);

  return null;
}
