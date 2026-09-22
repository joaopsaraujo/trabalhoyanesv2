// Parte do codigo para add a tela de inicio do telefone assim podera chegar notifcações de alerta

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});


self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});

self.addEventListener("push", (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch (e) {}
  const titulo = dados.title || "Monitoramento da Água";
  const corpo = dados.body || "Novo alerta do sistema.";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "monitoramento"
    })
  );
});
