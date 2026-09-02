/* global importScripts, firebase */
// Service worker do Firebase Cloud Messaging.
// A configuração chega pela query string na hora do register (não há import.meta.env aqui).
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

const config = Object.fromEntries(new URL(self.location).searchParams);

if (config.apiKey && config.projectId && config.appId && config.messagingSenderId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || "Gestão Cordial";
    const body = payload.notification?.body || payload.data?.body || "";
    const link = payload.data?.link || "/";
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      tag: payload.data?.notification_id || undefined,
      data: { link },
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    (async () => {
      const target = new URL(link, self.location.origin).href;
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })(),
  );
});
