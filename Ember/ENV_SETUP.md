# Environment Setup

This project uses both Expo client variables and server-side variables.

## 1) Copy environment file

```bash
cp .env.example .env
```

## 2) Fill required keys in `.env`

### Core

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_WS_URL` (for web local: `ws://localhost:8089`)
- `WS_PORT` (default: `8089`)

### AI / Voice

- `EXPO_PUBLIC_GEMINI_API_KEY` (optional for current flow)
- `EXPO_PUBLIC_ELEVENLABS_API_KEY` (client fallback usage)
- `ELEVENLABS_API_KEY` (server usage preferred)
- `EXPO_PUBLIC_CLAUDE_API_KEY` (optional currently)

### Backboard

- `EXPO_PUBLIC_BACKBOARD_API_KEY` (optional)
- `BACKBOARD_API_KEY` (server usage preferred)
- `BACKBOARD_BASE_URL` (default: `https://api.backboard.ai/v1`)

### Google Cloud Vision

- `GOOGLE_APPLICATION_CREDENTIALS=server/service-account.json`

Place your service account JSON file at:

- `server/service-account.json`

## 3) Run services

### WebSocket server

```bash
node server/server.js
```

### Expo app (web)

```bash
npx expo start -w -c
```

## 4) Multi-tab testing note (web)

Supabase web auth storage is configured with `sessionStorage` so each browser tab can keep an independent responder session for testing.

