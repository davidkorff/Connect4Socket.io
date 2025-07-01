let notificationPermission = null;
let isPageVisible = true;
let isPageFocused = true;

document.addEventListener('visibilitychange', () => {
    isPageVisible = !document.hidden;
});

window.addEventListener('focus', () => {
    isPageFocused = true;
});

window.addEventListener('blur', () => {
    isPageFocused = false;
});

async function initNotifications() {
    if ('Notification' in window && 'serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('Service Worker registered:', registration);

            notificationPermission = await Notification.requestPermission();
            
            if (notificationPermission === 'granted') {
                console.log('Notification permission granted');
                return true;
            }
        } catch (error) {
            console.error('Error setting up notifications:', error);
        }
    }
    return false;
}

function shouldShowNotification() {
    return notificationPermission === 'granted' && (!isPageVisible || !isPageFocused);
}

async function showTurnNotification(roomId, opponentPlayer) {
    if (!shouldShowNotification()) return;

    try {
        const registration = await navigator.serviceWorker.ready;
        const roomUrl = `${window.location.origin}/game/${roomId}`;
        
        await registration.showNotification('Connect 4 - Your Turn!', {
            body: `Player ${opponentPlayer} just made their move. It's your turn!`,
            icon: '/images/icon-placeholder.svg',
            badge: '/images/icon-placeholder.svg',
            tag: 'turn-notification',
            requireInteraction: true,
            vibrate: [200, 100, 200],
            data: {
                url: roomUrl,
                roomId: roomId
            },
            actions: [
                {
                    action: 'play',
                    title: 'Play Now'
                },
                {
                    action: 'dismiss',
                    title: 'Later'
                }
            ]
        });
    } catch (error) {
        console.error('Error showing notification:', error);
    }
}

function askForNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        const banner = document.createElement('div');
        banner.className = 'notification-banner';
        banner.innerHTML = `
            <div class="notification-content">
                <p>Enable notifications to get alerted when it's your turn!</p>
                <div class="notification-actions">
                    <button class="btn btn-small btn-primary" onclick="enableNotifications()">Enable</button>
                    <button class="btn btn-small btn-secondary" onclick="dismissNotificationBanner()">Not Now</button>
                </div>
            </div>
        `;
        document.body.appendChild(banner);
        
        setTimeout(() => {
            banner.classList.add('show');
        }, 1000);
    }
}

async function enableNotifications() {
    const result = await initNotifications();
    dismissNotificationBanner();
    
    if (result) {
        showSuccessMessage('Notifications enabled! You\'ll be alerted when it\'s your turn.');
    }
}

function dismissNotificationBanner() {
    const banner = document.querySelector('.notification-banner');
    if (banner) {
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 300);
    }
}

function showSuccessMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export { initNotifications, showTurnNotification, askForNotificationPermission };