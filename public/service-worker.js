self.addEventListener('push', function(event) {
    const options = {
        body: event.data ? event.data.text() : 'Your turn to play!',
        icon: '/images/icon-placeholder.svg',
        badge: '/images/icon-placeholder.svg',
        vibrate: [200, 100, 200],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'play',
                title: 'Play Now'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('Connect 4', options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    if (event.action === 'play') {
        clients.openWindow(event.notification.data.url || '/');
    } else {
        clients.openWindow(event.notification.data.url || '/');
    }
});

self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(clients.claim());
});