# ERA37 — Unified Chat Platform

Connect Telegram, Discord, and Slack into a single chat interface with on-demand multilingual translation.

## Features

- Bidirectional messaging across Telegram, Discord, and Slack
- Real-time message updates via Supabase Realtime
- On-demand translation (20+ languages) with cached results
- Invitation-based user access
- Dark-first UI with amber accent

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + Tailwind CSS
- **Backend**: Vercel Serverless Functions
- **Database**: Supabase (Postgres + Auth + Realtime)
- **Discord Worker**: Node.js on Railway (persistent WebSocket)
- **Translation**: Google Cloud Translation API

## Setup

1. Clone and install:
   ```bash
   npm install
   ```

2. Copy env template:
   ```bash
   cp .env.local.example .env.local
   ```

3. Set up Supabase:
   - Create a project at supabase.com
   - Run `supabase/migration.sql` in the SQL editor
   - Copy URL, anon key, and service role key to `.env.local`

4. Run dev server:
   ```bash
   npm run dev
   ```

## Platform Setup

**Telegram**: Create a bot via @BotFather, paste token in Settings.

**Discord**: Create a bot in Discord Developer Portal, enable Message Content Intent, paste token in Settings. Deploy the `discord-worker/` to Railway.

**Slack**: Create a Slack App with Events API and OAuth scopes (`channels:history`, `channels:read`, `chat:write`, `users:read`). Set Event Subscription URL to `https://your-domain/api/webhooks/slack`.

## Discord Worker (Railway)

```bash
cd discord-worker
npm install
# Set env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
node index.js
```

## Deploy

- **Vercel**: Connect the GitHub repo, add env vars
- **Railway**: Deploy `discord-worker/` directory
