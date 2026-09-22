// ============================================================
//  Service Worker — habilita instalação (PWA) e notificações.
//  Necessário para o iPhone poder mostrar notificações quando o
//  site é adicionado à Tela de Início (iOS 16.4+).
// ============================================================

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Ao tocar na notificação, foca a janela do app (ou abre uma nova).
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

// Suporte a push remoto (para o futuro, com FCM/VAPID + servidor).
// Sem um servidor enviando, este evento simplesmente não dispara.
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
