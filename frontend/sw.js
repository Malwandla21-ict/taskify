/*
  Taskify push service worker.

  This is what actually lets a notification reach the user with the tab
  (or the whole browser) closed — it runs in the background, independent
  of any open page, and wakes up when the browser's push service delivers
  a message. Registered from navbar.js (loaded on every logged-in page)
  with scope "/", so it covers the whole app regardless of which page the
  registration happened from.
*/

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "Taskify", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Taskify";
  const options = {
    body: data.body || "",
    icon: "./assets/logo/T_Transparent.png",
    badge: "./assets/logo/T_Transparent.png",
    data: { url: data.url || "./notifications.html" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* Clicking the OS-level notification focuses an already-open Taskify tab
   if there is one, instead of always opening a new one. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./notifications.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl.replace("./", "")) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
