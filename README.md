# ⛳ Minigolf Scorecard

A multiplayer mini golf scorecard web app with real-time synchronization via Firebase.

## Features

- **Multiplayer:** Up to 6+ players can play simultaneously in a game
- **Real-time Sync:** Scores are synchronized live via Firebase Realtime Database
- **Room Codes:** Easy join via 4-character code or QR code scan
- **Configurable:** Number of holes (9, 12, 18, or custom) and max attempts per hole
- **Color Selection:** Each player picks their own color
- **Scoreboard:** Clear results table with email sharing
- **PWA:** Installable as a home screen app (Service Worker + Manifest)
- **Offline Support:** Basic offline functionality through caching
- **Mobile-first:** Portrait mode, touch-friendly UI

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Backend/DB | Firebase Realtime Database |
| QR Code Generation | [qrcode-generator](https://github.com/nicholasKluge/qrcode-generator) |
| QR Code Scanning | [jsQR](https://github.com/nicholasKluge/jsQR) |
| Hosting | GitHub Pages (or any static host) |
| PWA | Service Worker + Web App Manifest |

## Project Structure

```
├── index.html          # Main HTML with all screens (Home, Create, Join, Lobby, Game, Scoreboard)
├── style.css           # Full styling (mobile-first)
├── app.js              # All app logic (screens, Firebase sync, game flow)
├── firebase-config.js  # Firebase configuration
├── sw.js               # Service Worker (caching)
├── manifest.json       # PWA Web App Manifest
└── SETUP.md            # Detailed Firebase setup guide
```

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USER/minigolf.git
cd minigolf
```

### 2. Set up Firebase

1. Create a free project on [Firebase Console](https://console.firebase.google.com)
2. Enable **Realtime Database** (location: `europe-west1`)
3. Register a web app and copy the `firebaseConfig` values
4. Paste them into `firebase-config.js`

> Detailed instructions: see [SETUP.md](SETUP.md)

### 3. Test locally

Since the app uses only static files, any simple HTTP server will do:

```bash
# With Python
python -m http.server 8000

# Or with Node.js
npx serve .
```

Then open `http://localhost:8000` in your browser.

### 4. Deploy (GitHub Pages)

```bash
git add .
git commit -m "Minigolf Multiplayer App"
git remote add origin https://github.com/YOUR_USER/minigolf.git
git push -u origin main
```

In GitHub: **Settings → Pages → Source: main branch** → Save.

## How It Works

1. **Player 1** opens the app → "Create new game" → picks name, color, number of holes → receives a 4-character room code
2. **Other players** open the app → "Join game" → enter the code (or scan the QR code)
3. **Host** sees all players in the lobby → presses "Start game"
4. **All players** see the game board and can enter scores per hole (synced in real-time)
5. At the end, the **Scoreboard** shows total scores – results can be shared via email

## Firebase Security Rules (Production)

```json
{
  "rules": {
    "games": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

## License

Private project.
