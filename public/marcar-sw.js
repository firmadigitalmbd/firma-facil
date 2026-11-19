// Service worker de /marcar: solo muestra los avisos de verificación.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Asistencia", body: "Tienes un registro pendiente.", url: "/marcar" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    /* aviso sin datos */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo.jpg",
      badge: "/logo.jpg",
      tag: "asistencia-verificacion",
      renotify: true,
      requireInteraction: true,
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/marcar";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes("/marcar") && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
