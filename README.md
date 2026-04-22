# Card Games

Real-time multiplayer card games for up to 6 players — **Wild Cards** (Cards Against Humanity-style) and **UNO**.

## Play with anyone, anywhere

### Option 1 — Deploy to Render.com (recommended, free, permanent URL)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` — click **Deploy**
5. Share the `https://card-games-xxxx.onrender.com` URL with anyone

> **Note:** Render free tier spins down after 15 min of inactivity. First load after sleep takes ~30 s.

---

### Option 2 — ngrok tunnel (quick, no account needed for local testing)

```bash
# Terminal 1 — build client once, then start server
npm run build
npm start

# Terminal 2 — expose port 3001 to the internet
npx ngrok http 3001
```

Share the `https://xxxx.ngrok-free.app` URL. Everyone connects through that URL.

---

### Option 3 — Same WiFi network only

```bash
# Terminal 1
cd server && node index.js

# Terminal 2
cd client && npm run dev
```

Vite prints a LAN URL like `http://192.168.x.x:5173` — share that with players on the same network.

---

## Development

```bash
# Install all dependencies
npm run build

# Run server (port 3001) and client dev server (port 5173) separately
npm run dev:server
npm run dev:client
```

## How to play

1. One player creates a room and shares the 4-letter code
2. Others enter their name and the room code to join (up to 6 players)
3. Host picks the game mode and starts

### Wild Cards (Cards Against Humanity-style)
- A rotating **Card Czar** reads the black prompt card
- Everyone else picks the funniest white card(s) from their hand
- Czar picks a winner — they get a point
- Every **3 points** unlocks a custom card slot: write any card text and it shuffles into the deck

### UNO
- Standard rules: match color or number, use action cards
- Draw a card if you can't play — turn passes automatically
- Tap a Wild card to pick your color
- First to empty their hand wins
