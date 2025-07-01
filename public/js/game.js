const socket = io();
const roomId = window.location.pathname.split('/').pop();
const board = document.getElementById('board');
const gameStatus = document.getElementById('gameStatus');
const shareLink = document.getElementById('shareLink');
const linkInput = document.getElementById('linkInput');
const copyLink = document.getElementById('copyLink');
const gameResult = document.getElementById('gameResult');
const rematchBtn = document.getElementById('rematchBtn');
const newGameBtn = document.getElementById('newGameBtn');
const player1El = document.getElementById('player1');
const player2El = document.getElementById('player2');
const gameHistoryEl = document.getElementById('gameHistory');
const opponentStatusEl = document.getElementById('opponentStatus');
const statusDotEl = opponentStatusEl.querySelector('.status-dot');
const statusTextEl = opponentStatusEl.querySelector('.status-text');
const rematchModal = document.getElementById('rematchModal');
const rematchModalBody = document.getElementById('rematchModalBody');

let playerNumber = null;
let gameState = null;
let canPlay = false;
let notificationsEnabled = false;
let pendingMove = null;
let savedRooms = JSON.parse(localStorage.getItem('connect4Rooms') || '[]');
let practiceMode = false;
let connectionCheckInterval = null;
let rematchCountdown = null;
let gameEndTime = null;
let rematchRequestTime = null;

// Get or create persistent player ID
function getPlayerId() {
    let playerId = localStorage.getItem('connect4PlayerId');
    if (!playerId) {
        playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('connect4PlayerId', playerId);
    }
    return playerId;
}

const playerId = getPlayerId();

linkInput.value = window.location.href;
shareLink.classList.remove('hidden');

copyLink.addEventListener('click', () => {
    linkInput.select();
    document.execCommand('copy');
    copyLink.textContent = 'Copied!';
    setTimeout(() => {
        copyLink.textContent = 'Copy Link';
    }, 2000);
});

function createBoard() {
    board.innerHTML = '';
    for (let row = 0; row < 6; row++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'board-row';
        
        for (let col = 0; col < 7; col++) {
            const cellEl = document.createElement('div');
            cellEl.className = 'cell';
            cellEl.dataset.column = col;
            cellEl.dataset.row = row;
            cellEl.addEventListener('click', handleCellClick);
            cellEl.addEventListener('touchstart', handleTouchStart);
            cellEl.addEventListener('mouseenter', handleCellHover);
            cellEl.addEventListener('mouseleave', handleCellLeave);
            rowEl.appendChild(cellEl);
        }
        
        board.appendChild(rowEl);
    }
}

function handleCellHover(e) {
    if (!canPlay || !gameState || gameState.winner || gameState.currentPlayer !== playerNumber) return;
    
    const column = parseInt(e.currentTarget.dataset.column);
    
    for (let row = 5; row >= 0; row--) {
        if (gameState.board[row][column] === 0) {
            const cells = board.querySelectorAll('.cell');
            const cellEl = cells[row * 7 + column];
            cellEl.classList.add('preview', `preview-player${playerNumber}`);
            break;
        }
    }
}

function handleCellLeave(e) {
    board.querySelectorAll('.cell.preview').forEach(cell => {
        cell.classList.remove('preview', 'preview-player1', 'preview-player2');
    });
}

function updateBoard(fullRefresh = true) {
    if (!gameState) return;
    
    if (fullRefresh) {
        const cells = board.querySelectorAll('.cell');
        gameState.board.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                const cellEl = cells[rowIndex * 7 + colIndex];
                cellEl.innerHTML = '';
                
                if (cell !== 0) {
                    const piece = document.createElement('div');
                    piece.className = `piece player${cell}`;
                    cellEl.appendChild(piece);
                }
            });
        });
    }
    
    updatePlayerIndicators();
}

function placePiece(row, column, player) {
    const cells = board.querySelectorAll('.cell');
    const cellEl = cells[row * 7 + column];
    
    const piece = document.createElement('div');
    piece.className = `piece player${player}`;
    cellEl.appendChild(piece);
}

function placePendingPiece(row, column, player) {
    removePendingPiece();
    
    const cells = board.querySelectorAll('.cell');
    const cellEl = cells[row * 7 + column];
    
    const piece = document.createElement('div');
    piece.className = `piece player${player} pending-piece`;
    cellEl.appendChild(piece);
}

function removePendingPiece() {
    const pendingPiece = board.querySelector('.pending-piece');
    if (pendingPiece) {
        pendingPiece.remove();
    }
}

function updatePlayerIndicators() {
    if (!gameState) return;
    
    player1El.classList.toggle('active', gameState.currentPlayer === 1 && !gameState.winner);
    player2El.classList.toggle('active', gameState.currentPlayer === 2 && !gameState.winner);
}

function handleCellClick(e) {
    e.preventDefault();
    
    const column = parseInt(e.currentTarget.dataset.column);
    
    if (practiceMode) {
        socket.emit('practice-move', { roomId, column });
        return;
    }
    
    if (!canPlay || !gameState || gameState.winner) return;
    
    if (gameState.currentPlayer !== playerNumber) {
        gameStatus.textContent = "Wait for your turn!";
        return;
    }
    
    if (pendingMove && pendingMove.column === column) {
        confirmMove();
    } else {
        socket.emit('preview-move', { roomId, column });
    }
}

function handleTouchStart(e) {
    e.preventDefault();
    handleCellClick(e);
}

function confirmMove() {
    if (!pendingMove) return;
    socket.emit('confirm-move', { roomId });
    hideActionButtons();
}

function cancelMove() {
    if (!pendingMove) return;
    removePendingPiece();
    pendingMove = null;
    socket.emit('cancel-move', { roomId });
    hideActionButtons();
}

function showActionButtons() {
    const actionButtons = document.getElementById('actionButtons');
    if (actionButtons) {
        actionButtons.classList.remove('hidden');
    }
}

function hideActionButtons() {
    const actionButtons = document.getElementById('actionButtons');
    if (actionButtons) {
        actionButtons.classList.add('hidden');
    }
}

function highlightWinningPieces() {
    if (!gameState || !gameState.winner || gameState.winner === 'draw') return;
    
    const board = gameState.board;
    const winner = gameState.winner;
    
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
            if (board[row][col] === winner) {
                if (checkWinningPiece(board, row, col, winner)) {
                    const cells = document.querySelectorAll('.cell');
                    const cellEl = cells[row * 7 + col];
                    const piece = cellEl.querySelector('.piece');
                    if (piece) {
                        piece.classList.add('winning-piece');
                    }
                }
            }
        }
    }
}

function checkWinningPiece(board, row, col, player) {
    const directions = [
        [[0, 1], [0, -1]],
        [[1, 0], [-1, 0]],
        [[1, 1], [-1, -1]],
        [[1, -1], [-1, 1]]
    ];

    for (const direction of directions) {
        const pieces = [[row, col]];
        
        for (const [dr, dc] of direction) {
            let r = row + dr;
            let c = col + dc;
            
            while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === player) {
                pieces.push([r, c]);
                r += dr;
                c += dc;
            }
        }
        
        if (pieces.length >= 4) return true;
    }
    
    return false;
}

function updateScoreDisplay() {
    if (!gameState || !gameState.score) return;
    
    const scoreEl = document.getElementById('scoreDisplay');
    if (scoreEl) {
        scoreEl.innerHTML = `
            <div class="score-item">
                <span class="score-label">Player 1</span>
                <span class="score-value">${gameState.score.player1}</span>
            </div>
            <div class="score-item">
                <span class="score-label">Draws</span>
                <span class="score-value">${gameState.score.draws}</span>
            </div>
            <div class="score-item">
                <span class="score-label">Player 2</span>
                <span class="score-value">${gameState.score.player2}</span>
            </div>
        `;
    }
}

function saveRoomToLocalStorage() {
    if (!savedRooms.includes(roomId)) {
        savedRooms.push(roomId);
        if (savedRooms.length > 10) {
            savedRooms.shift();
        }
        localStorage.setItem('connect4Rooms', JSON.stringify(savedRooms));
    }
    
    // Also save which player number we are in this room
    const roomPlayers = JSON.parse(localStorage.getItem('connect4RoomPlayers') || '{}');
    roomPlayers[roomId] = playerNumber;
    localStorage.setItem('connect4RoomPlayers', JSON.stringify(roomPlayers));
}

function loadGameHistory() {
    fetch(`/api/game-history/${roomId}`)
        .then(res => res.json())
        .then(data => {
            if (data.history && data.history.length > 0) {
                gameHistoryEl.innerHTML = '';
                data.history.forEach((game, index) => {
                    const item = document.createElement('div');
                    item.className = 'history-item';
                    
                    const date = new Date(game.date).toLocaleString();
                    const winnerText = game.winner === 'draw' ? 'Draw' : `Player ${game.winner}`;
                    const badgeClass = game.winner === 'draw' ? 'draw' : `player${game.winner}`;
                    
                    item.innerHTML = `
                        <span>Game ${index + 1} - ${date}</span>
                        <span class="winner-badge ${badgeClass}">${winnerText}</span>
                    `;
                    
                    gameHistoryEl.appendChild(item);
                });
            }
        });
}

socket.emit('join-room', { roomId, playerId });

socket.on('player-number', (number) => {
    playerNumber = number;
    gameStatus.textContent = `You are Player ${number}`;
});

socket.on('welcome-back', (number) => {
    playerNumber = number;
    gameStatus.textContent = `Welcome back! You are Player ${number}`;
    
    // Show a toast notification
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = 'Successfully reconnected to your game!';
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
});

socket.on('waiting-for-player', () => {
    gameStatus.innerHTML = `
        <div>📤 Share the link above to invite a friend!</div>
        <div style="margin-top: 10px">
            <button onclick="startPractice()" class="btn btn-small btn-secondary">🎮 Practice While Waiting</button>
        </div>
    `;
});

socket.on('can-make-first-move', () => {
    canPlay = true;
    gameStatus.innerHTML = `
        <div>🚀 Go ahead! Make the first move while waiting for your opponent.</div>
        <div style="margin-top: 10px">
            <button onclick="startPractice()" class="btn btn-small btn-secondary">🎮 Practice Instead</button>
        </div>
    `;
});

socket.on('game-start', (state) => {
    if (practiceMode) {
        endPractice();
    }
    gameState = state;
    canPlay = true;
    
    // Show connection status
    opponentStatusEl.classList.remove('hidden');
    statusDotEl.className = 'status-dot connected';
    statusTextEl.textContent = 'Opponent Connected';
    
    // Check if Player 1 already made a move
    const movesAlreadyMade = state.board.some(row => row.some(cell => cell !== 0));
    if (movesAlreadyMade && state.currentPlayer === 2) {
        gameStatus.textContent = `🎮 Game ON! Player 1 went first. Your turn, Player 2!`;
    } else {
        gameStatus.textContent = `🎮 Game ON! Player ${state.currentPlayer} goes first.`;
    }
    
    updateBoard();
    updateScoreDisplay();
    saveRoomToLocalStorage();
});

socket.on('game-state', (state) => {
    gameState = state;
    updateBoard();
    updateScoreDisplay();
    
    if (!gameState.winner && gameState.players.length === 2) {
        canPlay = true;
        if (gameState.currentPlayer === playerNumber) {
            gameStatus.textContent = '🎯 Your turn! Click a column to drop your piece.';
        } else {
            gameStatus.textContent = '⏳ Opponent is thinking...';
        }
    }
});

socket.on('move-preview', (move) => {
    pendingMove = move;
    placePendingPiece(move.row, move.column, move.player);
    showActionButtons();
});

socket.on('move-cancelled', () => {
    removePendingPiece();
    pendingMove = null;
    hideActionButtons();
});

socket.on('move-made', (state) => {
    const lastMove = state.lastMove;
    gameState = state;
    
    removePendingPiece();
    pendingMove = null;
    placePiece(lastMove.row, lastMove.column, lastMove.player);
    updateBoard(false);
    
    if (!gameState.winner && gameState.players.length === 2) {
        if (gameState.currentPlayer === playerNumber) {
            gameStatus.textContent = '🎯 Your turn! Click a column to drop your piece.';
            if (window.showTurnNotification) {
                window.showTurnNotification(roomId, lastMove.player);
            }
        } else {
            gameStatus.textContent = '⏳ Opponent is thinking...';
        }
    }
});

socket.on('game-won', (state) => {
    const lastMove = state.lastMove;
    gameState = state;
    canPlay = false;
    gameEndTime = Date.now();
    
    removePendingPiece();
    pendingMove = null;
    hideActionButtons();
    
    if (lastMove) {
        placePiece(lastMove.row, lastMove.column, lastMove.player);
    }
    updateBoard(false);
    updateScoreDisplay();
    
    const isWinner = state.winner === playerNumber;
    const winnerText = isWinner ? '🎉 Victory!' : '😔 Defeat';
    gameResult.textContent = winnerText;
    gameResult.className = `game-result winner ${isWinner ? 'winner' : ''}`;
    gameResult.classList.remove('hidden');
    rematchBtn.classList.remove('hidden');
    
    if (isWinner) {
        gameStatus.textContent = '🏆 Congratulations! You won this round!';
    } else {
        gameStatus.textContent = '💪 Good game! Better luck next time!';
    }
    
    highlightWinningPieces();
    loadGameHistory();
});

socket.on('game-draw', (state) => {
    const lastMove = state.lastMove;
    gameState = state;
    canPlay = false;
    
    removePendingPiece();
    pendingMove = null;
    hideActionButtons();
    
    if (lastMove) {
        placePiece(lastMove.row, lastMove.column, lastMove.player);
    }
    updateBoard(false);
    updateScoreDisplay();
    
    gameResult.textContent = "🤝 It's a tie!";
    gameResult.className = 'game-result draw';
    gameResult.classList.remove('hidden');
    rematchBtn.classList.remove('hidden');
    gameStatus.textContent = "🎯 Well matched! The board is full with no winner.";
    
    loadGameHistory();
});

socket.on('game-reset', (state) => {
    gameState = state;
    canPlay = true;
    gameResult.classList.add('hidden');
    rematchBtn.classList.add('hidden');
    rematchBtn.disabled = false;
    
    // Hide rematch modal and show celebration
    hideRematchModal();
    showRematchCelebration();
    
    // Animate board clear before updating
    animateBoardClear();
    
    setTimeout(() => {
        gameStatus.textContent = `🎮 New game! Player ${state.currentPlayer} goes first.`;
        updateBoard();
        updateScoreDisplay();
    }, 600);
});

socket.on('rematch-requested', (data) => {
    if (data && data.quick && gameEndTime && (Date.now() - gameEndTime) < 3000) {
        // Auto-accept quick rematch
        socket.emit('accept-rematch', roomId);
        hideRematchModal();
        
        // Show quick rematch message
        rematchModalBody.innerHTML = `
            <div class="quick-rematch">
                <h2>⚡ Quick Rematch! ⚡</h2>
                <p>Both players want to go again!</p>
            </div>
        `;
        rematchModal.classList.remove('hidden');
        setTimeout(() => hideRematchModal(), 1500);
    } else {
        showRematchModal(false);
        if (window.showRematchNotification) {
            window.showRematchNotification(roomId);
        }
    }
});

socket.on('opponent-connected', () => {
    if (gameState && gameState.players.length === 2) {
        opponentStatusEl.classList.remove('hidden');
        statusDotEl.className = 'status-dot connected';
        statusTextEl.textContent = 'Opponent Connected';
    }
});

socket.on('opponent-disconnected', (playerNum) => {
    if (playerNum !== playerNumber && gameState && gameState.players.length === 2) {
        statusDotEl.className = 'status-dot disconnected';
        statusTextEl.textContent = 'Opponent Disconnected';
        gameStatus.textContent = '⚠️ Opponent disconnected - They have 30s to reconnect';
    }
});

socket.on('player-disconnected', () => {
    canPlay = false;
    gameStatus.textContent = 'Opponent disconnected. Game paused.';
});

socket.on('error', (message) => {
    alert(message);
    window.location.href = '/';
});

socket.on('practice-started', () => {
    canPlay = true;
    gameStatus.innerHTML = `
        <div>Practice Mode - You're playing both sides!</div>
        <div style="margin-top: 10px">
            <button onclick="resetPractice()" class="btn btn-small btn-secondary">Reset Board</button>
            <button onclick="endPractice()" class="btn btn-small btn-primary">End Practice</button>
        </div>
    `;
});

socket.on('practice-move-made', (data) => {
    placePiece(data.row, data.column, data.player);
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    updatePlayerIndicators();
});

socket.on('practice-won', (data) => {
    placePiece(data.row, data.column, data.player);
    gameStatus.innerHTML = `
        <div>Player ${data.player} wins in practice!</div>
        <div style="margin-top: 10px">
            <button onclick="resetPractice()" class="btn btn-small btn-primary">Play Again</button>
            <button onclick="endPractice()" class="btn btn-small btn-secondary">End Practice</button>
        </div>
    `;
});

socket.on('practice-draw', (data) => {
    placePiece(data.row, data.column, data.player);
    gameStatus.innerHTML = `
        <div>Draw in practice!</div>
        <div style="margin-top: 10px">
            <button onclick="resetPractice()" class="btn btn-small btn-primary">Play Again</button>
            <button onclick="endPractice()" class="btn btn-small btn-secondary">End Practice</button>
        </div>
    `;
});

socket.on('practice-reset', () => {
    board.querySelectorAll('.piece').forEach(piece => piece.remove());
    gameState.currentPlayer = 1;
    updatePlayerIndicators();
    gameStatus.innerHTML = `
        <div>Practice Mode - Board reset!</div>
        <div style="margin-top: 10px">
            <button onclick="resetPractice()" class="btn btn-small btn-secondary">Reset Board</button>
            <button onclick="endPractice()" class="btn btn-small btn-primary">End Practice</button>
        </div>
    `;
});

socket.on('practice-ended', () => {
    practiceMode = false;
    canPlay = false;
    board.querySelectorAll('.piece').forEach(piece => piece.remove());
    gameStatus.innerHTML = `
        <div>Waiting for opponent... Share the link above!</div>
        <button onclick="startPractice()" class="btn btn-small btn-secondary" style="margin-top: 10px">Practice While Waiting</button>
    `;
});

socket.on('early-move-made', (state) => {
    const lastMove = state.lastMove;
    gameState = state;
    
    removePendingPiece();
    pendingMove = null;
    placePiece(lastMove.row, lastMove.column, lastMove.player);
    updateBoard(false);
    
    gameStatus.innerHTML = `
        <div>✅ Nice opening move! Now waiting for your opponent...</div>
        <div style="margin-top: 10px">
            <button onclick="startPractice()" class="btn btn-small btn-secondary">🎮 Practice While Waiting</button>
        </div>
    `;
    canPlay = false;
});

socket.on('rematch-declined', () => {
    hideRematchModal();
    gameStatus.textContent = '❌ Rematch declined. Start a new game or wait for another request.';
    rematchBtn.disabled = false;
});

function showRematchModal(isRequester = false) {
    if (isRequester) {
        rematchModalBody.innerHTML = `
            <div class="rematch-request">
                <h2>Rematch Requested! ⏳</h2>
                <p>Waiting for opponent to accept...</p>
                <div class="countdown">15</div>
            </div>
        `;
    } else {
        rematchModalBody.innerHTML = `
            <div class="rematch-request">
                <h2>Rematch? 🎮</h2>
                <p>Your opponent wants to play again!</p>
                <div class="countdown">15</div>
                <div class="rematch-buttons">
                    <button onclick="acceptRematch()" class="btn btn-accept">Accept</button>
                    <button onclick="declineRematch()" class="btn btn-secondary">Decline</button>
                </div>
            </div>
        `;
    }
    
    rematchModal.classList.remove('hidden');
    startRematchCountdown();
}

function startRematchCountdown() {
    let timeLeft = 15;
    const countdownEl = rematchModal.querySelector('.countdown');
    
    rematchCountdown = setInterval(() => {
        timeLeft--;
        if (countdownEl) {
            countdownEl.textContent = timeLeft;
        }
        
        if (timeLeft <= 0) {
            clearInterval(rematchCountdown);
            hideRematchModal();
            gameStatus.textContent = 'Rematch request expired';
        }
    }, 1000);
}

function hideRematchModal() {
    rematchModal.classList.add('hidden');
    if (rematchCountdown) {
        clearInterval(rematchCountdown);
        rematchCountdown = null;
    }
}

function acceptRematch() {
    socket.emit('accept-rematch', roomId);
    hideRematchModal();
}

function declineRematch() {
    socket.emit('decline-rematch', roomId);
    hideRematchModal();
    gameStatus.textContent = 'Rematch declined';
}

function animateBoardClear() {
    const pieces = board.querySelectorAll('.piece');
    board.classList.add('board-clear-animation');
    
    pieces.forEach((piece, index) => {
        setTimeout(() => {
            piece.classList.add('falling-out');
        }, index * 30);
    });
    
    setTimeout(() => {
        pieces.forEach(piece => piece.remove());
        board.classList.remove('board-clear-animation');
    }, 600);
}

function showRematchCelebration() {
    const celebration = document.createElement('div');
    celebration.className = 'rematch-celebration';
    celebration.textContent = '🎮 REMATCH! 🎮';
    document.body.appendChild(celebration);
    
    setTimeout(() => {
        celebration.remove();
    }, 1000);
}

window.acceptRematch = acceptRematch;
window.declineRematch = declineRematch;

rematchBtn.addEventListener('click', () => {
    rematchRequestTime = Date.now();
    const timeSinceEnd = rematchRequestTime - gameEndTime;
    
    // Quick rematch if both click within 3 seconds
    socket.emit('request-rematch', { roomId, quick: timeSinceEnd < 3000 });
    
    rematchBtn.disabled = true;
    showRematchModal(true);
});

newGameBtn.addEventListener('click', () => {
    window.location.href = '/';
});

function showSavedRooms() {
    const rooms = JSON.parse(localStorage.getItem('connect4Rooms') || '[]');
    if (rooms.length === 0) {
        alert('No saved rooms yet. Play some games and they will be saved automatically!');
        return;
    }
    
    let roomList = 'Your recent game rooms:\n\n';
    rooms.forEach((room, index) => {
        roomList += `${index + 1}. ${window.location.origin}/game/${room}\n`;
    });
    
    alert(roomList);
}

function startPractice() {
    practiceMode = true;
    socket.emit('start-practice', { roomId });
}

function endPractice() {
    practiceMode = false;
    socket.emit('end-practice', { roomId });
    updateBoard();
}

function resetPractice() {
    socket.emit('reset-practice', { roomId });
}

window.confirmMove = confirmMove;
window.cancelMove = cancelMove;
window.showSavedRooms = showSavedRooms;
window.startPractice = startPractice;
window.endPractice = endPractice;
window.resetPractice = resetPractice;

createBoard();
loadGameHistory();

async function setupNotifications() {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
        import { initNotifications, showTurnNotification, showRematchNotification, askForNotificationPermission } from '/js/notifications.js';
        
        window.showTurnNotification = showTurnNotification;
        window.showRematchNotification = showRematchNotification;
        
        setTimeout(() => {
            askForNotificationPermission();
        }, 5000);
        
        initNotifications();
    `;
    document.body.appendChild(script);
}

setupNotifications();