self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Nova Notificação!', body: event.data.text() };
    }
  }

  const title = data.title || 'Novidade na Loja!';
  const options = {
    body: data.body || 'Confira as novas ofertas disponíveis no app.',
    image: data.image || undefined,
    icon: data.icon || data.badge || '/public/img/background.png',
    badge: data.badge || data.icon || '/public/img/background.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // Garante uma URL absoluta válida
  const rawUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // 1. Procura se o PWA já está aberto em segundo plano
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // Se a janela já estiver aberta na loja (ou na raiz da loja), dá foco nela
        if (client.url.startsWith(targetUrl) || targetUrl.startsWith(client.url)) {
          if ('focus' in client) {
            return client.focus();
          }
        }
      }

      // 2. Se não estiver aberto, abre no escopo do WebAPK nativo
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});