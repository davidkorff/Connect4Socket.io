const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

const games = new Map();

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/index.html'));
});

app.get('/game/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/game.html'));
});

app.post('/api/create-room', async (req, res) => {
    const roomId = uuidv4();
    const gameState = {
        players: [],
        playerIds: {},  // Maps player IDs to player numbers
        socketToPlayer: {},  // Maps socket IDs to player IDs
        board: Array(6).fill(null).map(() => Array(7).fill(0)),
        currentPlayer: 1,
        winner: null,
        roomId: roomId,
        pendingMove: null,
        score: { player1: 0, player2: 0, draws: 0 },
        practiceMode: false,
        practiceBoard: null,
        gameStarted: false,
        moveHistory: []
    };
    
    games.set(roomId, gameState);
    
    try {
        await db.createRoom(roomId);
        await db.saveGameState(roomId, gameState);
        res.json({ roomId });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

app.get('/api/game-history/:roomId', async (req, res) => {
    try {
        const history = await db.getGameHistory(req.params.roomId);
        res.json({ history });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.json({ history: [] });
    }
});

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join-room', async ({ roomId, playerId }) => {
        let game = games.get(roomId);
        
        if (!game) {
            const exists = await db.roomExists(roomId);
            if (exists) {
                const savedState = await db.getGameState(roomId);
                if (savedState) {
                    game = savedState;
                    // Initialize maps if they don't exist (for old games)
                    if (!game.playerIds) game.playerIds = {};
                    if (!game.socketToPlayer) game.socketToPlayer = {};
                    games.set(roomId, game);
                }
            }
            
            if (!game) {
                socket.emit('error', 'Game room not found');
                return;
            }
        }

        socket.join(roomId);
        await db.updateRoomActivity(roomId);
        
        // Check if this player was already in the game
        let playerNumber = game.playerIds[playerId];
        
        if (!playerNumber) {
            // New player joining
            if (Object.keys(game.playerIds).length < 2) {
                playerNumber = Object.keys(game.playerIds).length + 1;
                game.playerIds[playerId] = playerNumber;
                if (!game.players.includes(socket.id)) {
                    game.players.push(socket.id);
                }
            } else {
                socket.emit('error', 'Game room is full');
                return;
            }
        } else {
            // Returning player
            const oldSocketIndex = game.players.findIndex(id => game.socketToPlayer[id] === playerId);
            if (oldSocketIndex !== -1) {
                game.players[oldSocketIndex] = socket.id;
            }
            socket.emit('welcome-back', playerNumber);
        }
        
        game.socketToPlayer[socket.id] = playerId;
        socket.emit('player-number', playerNumber);
        await db.saveGameState(roomId, game);

        const score = await db.getScore(roomId);
        game.score = { player1: score.player1_wins, player2: score.player2_wins, draws: score.draws };

        if (Object.keys(game.playerIds).length === 2 && game.players.length === 2) {
            game.gameStarted = true;
            io.to(roomId).emit('game-start', game);
            io.to(roomId).emit('opponent-connected');
        } else {
            socket.emit('waiting-for-player');
            if (Object.keys(game.playerIds).length === 1) {
                socket.emit('can-make-first-move');
            }
        }

        socket.emit('game-state', game);
    });

    socket.on('preview-move', ({ roomId, column }) => {
        const game = games.get(roomId);
        
        if (!game || game.winner) return;
        
        const playerId = game.socketToPlayer[socket.id];
        const playerNumber = game.playerIds[playerId];
        
        if (!playerNumber || playerNumber !== game.currentPlayer) {
            return;
        }

        for (let row = 5; row >= 0; row--) {
            if (game.board[row][column] === 0) {
                game.pendingMove = { row, column, player: game.currentPlayer };
                socket.emit('move-preview', game.pendingMove);
                break;
            }
        }
    });

    socket.on('confirm-move', async ({ roomId }) => {
        const game = games.get(roomId);
        
        if (!game || game.winner || !game.pendingMove) return;
        
        const playerId = game.socketToPlayer[socket.id];
        const playerNumber = game.playerIds[playerId];
        
        // Allow Player 1 to make moves before game starts
        if (!game.gameStarted && playerNumber === 1 && game.currentPlayer === 1) {
            const { row, column, player } = game.pendingMove;
            game.board[row][column] = player;
            game.moveHistory.push({ row, column, player });
            
            const moveData = {
                row,
                column,
                player: player
            };
            
            game.currentPlayer = 2;
            game.pendingMove = null;
            await db.saveGameState(roomId, game);
            socket.emit('early-move-made', { ...game, lastMove: moveData });
            return;
        }
        
        if (!playerNumber || playerNumber !== game.currentPlayer) {
            socket.emit('invalid-move', 'Not your turn');
            return;
        }

        const { row, column, player } = game.pendingMove;
        game.board[row][column] = player;
        
        const moveData = {
            row,
            column,
            player: player
        };
        
        if (checkWinner(game.board, row, column, player)) {
            game.winner = player;
            await db.updateScore(roomId, player);
            await db.saveGameHistory(roomId, player, calculateMoves(game.board), game.board);
            await db.saveGameState(roomId, game);
            const updatedScore = await db.getScore(roomId);
            game.score = { player1: updatedScore.player1_wins, player2: updatedScore.player2_wins, draws: updatedScore.draws };
            io.to(roomId).emit('game-won', { ...game, lastMove: moveData });
        } else if (isBoardFull(game.board)) {
            game.winner = 'draw';
            await db.updateScore(roomId, 'draw');
            await db.saveGameHistory(roomId, 'draw', calculateMoves(game.board), game.board);
            await db.saveGameState(roomId, game);
            const updatedScore = await db.getScore(roomId);
            game.score = { player1: updatedScore.player1_wins, player2: updatedScore.player2_wins, draws: updatedScore.draws };
            io.to(roomId).emit('game-draw', { ...game, lastMove: moveData });
        } else {
            game.currentPlayer = game.currentPlayer === 1 ? 2 : 1;
            game.pendingMove = null;
            await db.saveGameState(roomId, game);
            io.to(roomId).emit('move-made', { ...game, lastMove: moveData });
        }
    });

    socket.on('cancel-move', ({ roomId }) => {
        const game = games.get(roomId);
        if (game) {
            game.pendingMove = null;
            socket.emit('move-cancelled');
        }
    });

    socket.on('start-practice', ({ roomId }) => {
        const game = games.get(roomId);
        if (!game || game.players.length > 1) return;
        
        game.practiceMode = true;
        game.practiceBoard = JSON.parse(JSON.stringify(game.board));
        socket.emit('practice-started');
    });

    socket.on('practice-move', ({ roomId, column }) => {
        const game = games.get(roomId);
        if (!game || !game.practiceMode || game.players.length > 1) return;
        
        for (let row = 5; row >= 0; row--) {
            if (game.practiceBoard[row][column] === 0) {
                game.practiceBoard[row][column] = game.currentPlayer;
                
                const moveData = {
                    row,
                    column,
                    player: game.currentPlayer,
                    board: game.practiceBoard
                };
                
                if (checkWinner(game.practiceBoard, row, column, game.currentPlayer)) {
                    socket.emit('practice-won', moveData);
                } else if (isBoardFull(game.practiceBoard)) {
                    socket.emit('practice-draw', moveData);
                } else {
                    game.currentPlayer = game.currentPlayer === 1 ? 2 : 1;
                    socket.emit('practice-move-made', moveData);
                }
                break;
            }
        }
    });

    socket.on('reset-practice', ({ roomId }) => {
        const game = games.get(roomId);
        if (!game || !game.practiceMode) return;
        
        game.practiceBoard = Array(6).fill(null).map(() => Array(7).fill(0));
        game.currentPlayer = 1;
        socket.emit('practice-reset');
    });

    socket.on('end-practice', ({ roomId }) => {
        const game = games.get(roomId);
        if (!game) return;
        
        game.practiceMode = false;
        game.practiceBoard = null;
        game.currentPlayer = 1;
        socket.emit('practice-ended');
    });

    socket.on('request-rematch', async (data) => {
        const { roomId, quick } = data;
        const game = games.get(roomId);
        if (!game) return;

        if (!game.rematchRequests) {
            game.rematchRequests = [];
            game.rematchRequestTime = Date.now();
        }

        if (!game.rematchRequests.includes(socket.id)) {
            game.rematchRequests.push(socket.id);
            socket.to(roomId).emit('rematch-requested', { quick });
        }

        if (game.rematchRequests.length === 2) {
            await db.toggleStartingPlayer(roomId);
            const score = await db.getScore(roomId);
            
            game.board = Array(6).fill(null).map(() => Array(7).fill(0));
            game.currentPlayer = score.starting_player;
            game.winner = null;
            game.pendingMove = null;
            game.rematchRequests = [];
            game.rematchRequestTime = null;
            await db.saveGameState(roomId, game);
            io.to(roomId).emit('game-reset', game);
        }
    });
    
    socket.on('accept-rematch', async (roomId) => {
        const game = games.get(roomId);
        if (!game || !game.rematchRequests || game.rematchRequests.length === 0) return;
        
        if (!game.rematchRequests.includes(socket.id)) {
            game.rematchRequests.push(socket.id);
        }
        
        if (game.rematchRequests.length === 2) {
            await db.toggleStartingPlayer(roomId);
            const score = await db.getScore(roomId);
            
            game.board = Array(6).fill(null).map(() => Array(7).fill(0));
            game.currentPlayer = score.starting_player;
            game.winner = null;
            game.pendingMove = null;
            game.rematchRequests = [];
            game.rematchRequestTime = null;
            await db.saveGameState(roomId, game);
            io.to(roomId).emit('game-reset', game);
        }
    });
    
    socket.on('decline-rematch', async (roomId) => {
        const game = games.get(roomId);
        if (!game) return;
        
        game.rematchRequests = [];
        game.rematchRequestTime = null;
        socket.to(roomId).emit('rematch-declined');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        for (const [roomId, game] of games.entries()) {
            if (game.socketToPlayer && game.socketToPlayer[socket.id]) {
                const playerId = game.socketToPlayer[socket.id];
                const playerNumber = game.playerIds[playerId];
                
                if (playerNumber) {
                    // Notify opponent of disconnection
                    socket.to(roomId).emit('opponent-disconnected', playerNumber);
                    
                    // Clean up socket mappings but keep player ID mapping
                    delete game.socketToPlayer[socket.id];
                    const playerIndex = game.players.indexOf(socket.id);
                    if (playerIndex !== -1) {
                        game.players.splice(playerIndex, 1);
                    }
                }
            }
        }
    });
    
    socket.on('ping', () => {
        socket.emit('pong');
    });
});

function checkWinner(board, row, col, player) {
    const directions = [
        [[0, 1], [0, -1]],
        [[1, 0], [-1, 0]],
        [[1, 1], [-1, -1]],
        [[1, -1], [-1, 1]]
    ];

    for (const direction of directions) {
        let count = 1;
        
        for (const [dr, dc] of direction) {
            let r = row + dr;
            let c = col + dc;
            
            while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === player) {
                count++;
                r += dr;
                c += dc;
            }
        }
        
        if (count >= 4) return true;
    }
    
    return false;
}

function isBoardFull(board) {
    return board[0].every(cell => cell !== 0);
}

function calculateMoves(board) {
    let moves = 0;
    for (let row of board) {
        for (let cell of row) {
            if (cell !== 0) moves++;
        }
    }
    return moves;
}

async function startServer() {
    try {
        await db.initDatabase();
        console.log('Database initialized');
        
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
}

startServer();