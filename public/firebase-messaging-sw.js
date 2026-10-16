/* global importScripts, firebase */
// Service worker do Firebase Cloud Messaging.
// A configuração chega pela query string na hora do register (não há import.meta.env aqui).
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

const config = Object.fromEntries(new URL(self.location).searchParams);
let assistantDelivery = Promise.resolve();

// Serialize duplicate deliveries across retries; only opaque IDs are persisted.
async function showOnceAssistant(data, title, options) {
  const id = data.notification_id;
  const cache = await caches.open("cordial-assistant-notifications-v1");
  const key = new Request(
    `${self.location.origin}/__assistant-notification/${encodeURIComponent(id)}`,
  );
  if (await cache.match(key)) return;
  await self.registration.showNotification(title, options);
  await cache.put(key, new Response("seen"));
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - 256)).map((k) => cache.delete(k)));
}

if (config.apiKey && config.projectId && config.appId && config.messagingSenderId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const title = data.title || payload.notification?.title || "Gestão Cordial";
    const body = data.body || payload.notification?.body || "";
    const link = data.link || "/";
    // `renotify: false` + tag estável: o mesmo evento substitui a bolha em vez de empilhar.
    const options = {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: data.tag || data.notification_id || undefined,
      renotify: false,
      actions: data.cta ? [{ action: "open", title: data.cta }] : undefined,
      data: { link, notification_id: data.notification_id },
    };
    if (["assistant_briefing", "assistant_routine"].includes(data.type) && data.notification_id) {
      assistantDelivery = assistantDelivery
        .catch(() => undefined)
        .then(() => showOnceAssistant(data, title, options));
      return assistantDelivery;
    }
    return self.registration.showNotification(title, options);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    (async () => {
      const target = new URL(link, self.location.origin).href;
      if (new URL(target).origin !== self.location.origin) return;
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })(),
  );
});
