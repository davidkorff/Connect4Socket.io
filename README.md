# Connect 4 Multiplayer

A real-time multiplayer Connect 4 game that works on both iPhone and Android through the web browser.

## Features

- Real-time multiplayer gameplay using WebSockets
- Shareable game room links
- Game history tracking with SQLite persistence
- Mobile-responsive design
- Push notifications for turn alerts
- Rematch functionality
- Smooth animations with piece drop effects
- Clean, modern UI
- Progressive Web App (PWA) support

## Getting Started

1. Install dependencies:
```bash
cd connect4-multiplayer
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser to `http://localhost:3000`

4. Create a game room and share the link with a friend!

## How to Play

1. Click "Create Game Room" on the home page
2. Share the generated link with your friend
3. Take turns clicking columns to drop your pieces
4. First player to connect 4 pieces in a row (horizontal, vertical, or diagonal) wins!
5. Request a rematch or create a new game room

## Development

For development with auto-restart:
```bash
npm run dev
```

## Deployment to Render

1. Push your code to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Render will automatically detect the build settings from `render.yaml`
5. Click "Create Web Service"

The app will be deployed with:
- Automatic HTTPS
- SQLite database persistence
- WebSocket support
- Push notifications

## Environment Variables

No environment variables are required for basic operation. The app uses:
- `PORT` - Automatically set by Render
- SQLite database stored locally in the container

## Notes

- Push notifications require HTTPS (automatically provided by Render)
- Users will be prompted to enable notifications after 5 seconds
- Notifications only appear when the browser tab is not active
- Game data persists in SQLite database