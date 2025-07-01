function loadRecentGames() {
    const recentGames = JSON.parse(localStorage.getItem('connect4Rooms') || '[]');
    const recentGamesDiv = document.getElementById('recentGames');
    const recentGamesList = document.getElementById('recentGamesList');
    
    if (recentGames.length > 0) {
        recentGamesDiv.classList.remove('hidden');
        recentGamesList.innerHTML = '';
        
        recentGames.slice().reverse().forEach((roomId, index) => {
            const gameItem = document.createElement('div');
            gameItem.className = 'recent-game-item';
            gameItem.innerHTML = `
                <div class="game-info">
                    <span class="game-number">Game ${recentGames.length - index}</span>
                    <span class="room-id">${roomId.slice(0, 8)}...</span>
                </div>
                <div class="game-actions">
                    <button onclick="window.location.href='/game/${roomId}'" class="btn btn-small btn-primary">Continue</button>
                    <button onclick="copyGameLink('${roomId}')" class="btn btn-small btn-secondary">Copy Link</button>
                </div>
            `;
            recentGamesList.appendChild(gameItem);
        });
    }
}

function copyGameLink(roomId) {
    const link = `${window.location.origin}/game/${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

window.copyGameLink = copyGameLink;

document.getElementById('createRoom').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/create-room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (data.roomId) {
            window.location.href = `/game/${data.roomId}`;
        }
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Failed to create game room. Please try again.');
    }
});

// Load recent games on page load
loadRecentGames();