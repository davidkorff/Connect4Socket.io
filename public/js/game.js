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

let playerNumber = null;
let gameState = null;
let canPlay = false;
let notificationsEnabled = false;
let pendingMove = null;
let savedRooms = JSON.parse(localStorage.getItem('connect4Rooms') || '[]');

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
    if (!canPlay || !gameState || gameState.winner) return;
    
    const column = parseInt(e.currentTarget.dataset.column);
    
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

socket.emit('join-room', roomId);

socket.on('player-number', (number) => {
    playerNumber = number;
    gameStatus.textContent = `You are Player ${number}`;
});

socket.on('waiting-for-player', () => {
    gameStatus.textContent = 'Waiting for opponent... Share the link above!';
});

socket.on('game-start', (state) => {
    gameState = state;
    canPlay = true;
    gameStatus.textContent = `Game started! Player ${state.currentPlayer} goes first.`;
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
        const currentPlayerText = gameState.currentPlayer === playerNumber ? 'Your turn!' : "Opponent's turn";
        gameStatus.textContent = currentPlayerText;
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
        const currentPlayerText = gameState.currentPlayer === playerNumber ? 'Your turn!' : "Opponent's turn";
        gameStatus.textContent = currentPlayerText;
        
        if (gameState.currentPlayer === playerNumber && window.showTurnNotification) {
            window.showTurnNotification(roomId, lastMove.player);
        }
    }
});

socket.on('game-won', (state) => {
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
    
    const winnerText = state.winner === playerNumber ? 'You won!' : 'You lost!';
    gameResult.textContent = winnerText;
    gameResult.className = `game-result winner ${state.winner === playerNumber ? 'winner' : ''}`;
    gameResult.classList.remove('hidden');
    rematchBtn.classList.remove('hidden');
    gameStatus.textContent = `Player ${state.winner} wins!`;
    
    highlightWinningPieces();
    loadGameHistory();
});

socket.on('game-draw', (state) => {
    const lastMove = state.lastMove;
    gameState = state;
    canPlay = false;
    
    if (lastMove) {
        placePiece(lastMove.row, lastMove.column, lastMove.player);
    }
    updateBoard(false);
    
    gameResult.textContent = "It's a draw!";
    gameResult.className = 'game-result draw';
    gameResult.classList.remove('hidden');
    rematchBtn.classList.remove('hidden');
    gameStatus.textContent = "Game ended in a draw!";
    
    loadGameHistory();
});

socket.on('game-reset', (state) => {
    gameState = state;
    canPlay = true;
    gameResult.classList.add('hidden');
    rematchBtn.classList.add('hidden');
    gameStatus.textContent = `New game started! Player ${state.currentPlayer} goes first.`;
    updateBoard();
    updateScoreDisplay();
});

socket.on('rematch-requested', () => {
    gameStatus.textContent = 'Opponent wants a rematch!';
});

socket.on('player-disconnected', () => {
    canPlay = false;
    gameStatus.textContent = 'Opponent disconnected. Game paused.';
});

socket.on('error', (message) => {
    alert(message);
    window.location.href = '/';
});

rematchBtn.addEventListener('click', () => {
    socket.emit('request-rematch', roomId);
    rematchBtn.disabled = true;
    rematchBtn.textContent = 'Waiting for opponent...';
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

window.confirmMove = confirmMove;
window.cancelMove = cancelMove;
window.showSavedRooms = showSavedRooms;

createBoard();
loadGameHistory();

async function setupNotifications() {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
        import { initNotifications, showTurnNotification, askForNotificationPermission } from '/js/notifications.js';
        
        window.showTurnNotification = showTurnNotification;
        
        setTimeout(() => {
            askForNotificationPermission();
        }, 5000);
        
        initNotifications();
    `;
    document.body.appendChild(script);
}

setupNotifications();