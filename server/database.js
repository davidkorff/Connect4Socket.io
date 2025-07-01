const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let db;

async function initDatabase() {
    db = await open({
        filename: path.join(__dirname, '../connect4.db'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS game_rooms (
            room_id TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
            player1_wins INTEGER DEFAULT 0,
            player2_wins INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            games_played INTEGER DEFAULT 0,
            starting_player INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS game_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            winner TEXT NOT NULL,
            player1_id TEXT,
            player2_id TEXT,
            moves INTEGER NOT NULL,
            board_state TEXT,
            played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES game_rooms(room_id)
        );

        CREATE TABLE IF NOT EXISTS game_states (
            room_id TEXT PRIMARY KEY,
            board TEXT NOT NULL,
            current_player INTEGER NOT NULL,
            players TEXT NOT NULL,
            winner TEXT,
            pending_move TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES game_rooms(room_id)
        );
    `);

    return db;
}

async function createRoom(roomId) {
    await db.run('INSERT INTO game_rooms (room_id) VALUES (?)', roomId);
}

async function saveGameState(roomId, gameState) {
    const board = JSON.stringify(gameState.board);
    const players = JSON.stringify(gameState.players);
    
    await db.run(`
        INSERT OR REPLACE INTO game_states (room_id, board, current_player, players, winner, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, roomId, board, gameState.currentPlayer, players, gameState.winner);
}

async function getGameState(roomId) {
    const row = await db.get('SELECT * FROM game_states WHERE room_id = ?', roomId);
    if (!row) return null;
    
    return {
        board: JSON.parse(row.board),
        currentPlayer: row.current_player,
        players: JSON.parse(row.players),
        winner: row.winner,
        roomId: roomId
    };
}

async function saveGameHistory(roomId, winner, moves, boardState) {
    await db.run(`
        INSERT INTO game_history (room_id, winner, moves, board_state)
        VALUES (?, ?, ?, ?)
    `, roomId, winner, moves, JSON.stringify(boardState));
}

async function getGameHistory(roomId) {
    const rows = await db.all(`
        SELECT * FROM game_history 
        WHERE room_id = ? 
        ORDER BY played_at DESC
    `, roomId);
    
    return rows.map(row => ({
        winner: row.winner,
        date: row.played_at,
        moves: row.moves
    }));
}

async function roomExists(roomId) {
    const row = await db.get('SELECT 1 FROM game_rooms WHERE room_id = ?', roomId);
    return !!row;
}

async function updateRoomActivity(roomId) {
    await db.run(`
        UPDATE game_rooms 
        SET last_activity = CURRENT_TIMESTAMP 
        WHERE room_id = ?
    `, roomId);
}

async function updateScore(roomId, winner) {
    if (winner === 'draw') {
        await db.run(`
            UPDATE game_rooms 
            SET draws = draws + 1, games_played = games_played + 1
            WHERE room_id = ?
        `, roomId);
    } else {
        const column = winner === 1 ? 'player1_wins' : 'player2_wins';
        await db.run(`
            UPDATE game_rooms 
            SET ${column} = ${column} + 1, games_played = games_played + 1
            WHERE room_id = ?
        `, roomId);
    }
}

async function getScore(roomId) {
    const row = await db.get(`
        SELECT player1_wins, player2_wins, draws, games_played, starting_player
        FROM game_rooms 
        WHERE room_id = ?
    `, roomId);
    return row || { player1_wins: 0, player2_wins: 0, draws: 0, games_played: 0, starting_player: 1 };
}

async function toggleStartingPlayer(roomId) {
    await db.run(`
        UPDATE game_rooms 
        SET starting_player = CASE WHEN starting_player = 1 THEN 2 ELSE 1 END
        WHERE room_id = ?
    `, roomId);
}

module.exports = {
    initDatabase,
    createRoom,
    saveGameState,
    getGameState,
    saveGameHistory,
    getGameHistory,
    roomExists,
    updateRoomActivity,
    updateScore,
    getScore,
    toggleStartingPlayer
};