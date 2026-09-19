"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/lib/actions";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

type Status = "loading" | "unsupported" | "denied" | "enabled" | "disabled" | "working";

export default function PushNotificationsCard({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (
        !vapidPublicKey ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setStatus(subscription ? "enabled" : "disabled");
      } catch {
        setStatus("disabled");
      }
    })();
  }, [vapidPublicKey]);

  async function enable() {
    setError("");
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "disabled");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
      });
      const json = subscription.toJSON();
      await savePushSubscription({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
      });
      setStatus("enabled");
    } catch {
      setError("Couldn't turn on notifications on this device. Please try again.");
      setStatus("disabled");
    }
  }

  async function disable() {
    setError("");
    setStatus("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("disabled");
    } catch {
      setError("Couldn't turn off notifications. Please try again.");
      setStatus("enabled");
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Notifications</h2>
      <p className="mt-1 text-sm text-stone-600">
        Get a heads-up on this device 24 hours and 2 hours before every class you&apos;re booked
        into. On iPhone, first add the app to your home screen (Share → Add to Home Screen) and
        open it from there.
      </p>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4">
        {status === "loading" && <p className="text-sm text-stone-500">Checking this device…</p>}
        {status === "unsupported" && (
          <p className="text-sm text-stone-500">
            Notifications aren&apos;t available in this browser. On iPhone, install the app to your
            home screen first, then enable them from there.
          </p>
        )}
        {status === "denied" && (
          <p className="text-sm text-stone-500">
            Notifications are blocked for this app in your device settings. Allow them there, then
            come back to turn reminders on.
          </p>
        )}
        {status === "working" && <p className="text-sm text-stone-500">Working…</p>}
        {status === "disabled" && (
          <button
            type="button"
            onClick={enable}
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90"
          >
            Turn on class reminders
          </button>
        )}
        {status === "enabled" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
              Notifications are on for this device.
            </p>
            <button
              type="button"
              onClick={disable}
              className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Turn off
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
