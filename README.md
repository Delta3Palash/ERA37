# ERA37 — Unified Chat Platform

Connect Telegram, Discord, Slack, and WhatsApp into a single shared workspace with real-time messaging, cross-platform bridging, image support, and on-demand multilingual translation.

## Features

- **Cross-platform messaging** — Telegram, Discord, Slack, and WhatsApp in one interface
- **Bidirectional** — Read and reply to messages from any connected platform
- **Message bridging** — Incoming messages auto-forward to all other connected platforms (toggle per workspace)
- **Send to All** — Broadcast a message to every connected channel with one click
- **GIF picker** — Search and send GIFs via KLIPY API (Tenor replacement)
- **Image support** — Inline image display from all platforms
- **On-demand translation** — 20+ languages, click-to-translate with cached results
- **Discord-style UI** — Clean message layout with grouped consecutive messages, hover-to-translate
- **Shared workspace** — Admin configures one channel per platform, all users see the same conversations
- **OAuth login** — Sign in with Discord, Google, or Slack
- **Invite-only access** — Invite code required for first-time signup; returning users sign in directly
- **User preferences** — Each user picks their translation language (globe icon in sidebar)
- **Admin controls** — Bridge toggle, channel management, clear all messages (danger zone)
- **Terms of Service** — Required acceptance before accessing the workspace
- **Real-time updates** — Messages appear instantly via Supabase Realtime with visibility-based reconnection
- **Mobile responsive** — Slide-in sidebar drawer on mobile with hamburger menu
- **Dark-first UI** — Amber accent (#FFA800), Inter font, responsive design

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), Tailwind CSS, Lucide Icons |
| Auth | Supabase Auth (OAuth: Discord, Google, Slack) |
| Database | Supabase Postgres with Row Level Security |
| Real-time | Supabase Realtime (Postgres Changes) |
| Hosting | Vercel (app) + Railway (Discord worker) |
| Translation | Google Cloud Translation API v2 |
| Discord Gateway | discord.js on Railway (persistent WebSocket) |
| WhatsApp | Meta WhatsApp Cloud API v21.0 |
| GIFs | KLIPY API (free Tenor replacement) |

## Architecture

```
                         +------------------+
  Telegram ──webhook──>  |                  |
                         |   Vercel         |
  Slack ────events───>   |   (Next.js API   |  <──>  Supabase
                         |    Routes)       |        (Postgres + Realtime + Auth)
  WhatsApp ─webhook──>   |                  |
                         |   Bridge Engine  |──> Forwards to all other platforms
  Discord ──gateway──>   |                  |
       (Railway worker)  +------------------+
                                ^
                                |
                          Browser clients
                          (Supabase Realtime)
```

**How it works:**
- Admin connects one channel per platform (Telegram group, Discord channel, Slack channel, WhatsApp number)
- Incoming messages hit webhooks (Telegram/Slack/WhatsApp) or the Railway worker (Discord)
- Messages are stored in Supabase and pushed to all connected browsers via Realtime
- If bridging is enabled, incoming messages are automatically forwarded to all other connected platforms
- Users can reply from the UI — messages are sent back to the originating platform
- Translation is on-demand: click the translate icon on any message
- Tab visibility detection refetches messages when the browser tab is reopened

## Project Structure

```
ERA37/
  app/
    page.tsx                           Landing page (Get Started + Sign In)
    join/page.tsx                      Invite code + OAuth login
    tos/page.tsx                       Terms of Service
    chat/
      layout.tsx                       Chat shell (sidebar + content)
      page.tsx                         Empty state / redirect
      all/page.tsx                     Unified view (all platforms)
      [chatId]/page.tsx                Per-connection conversation view
    settings/page.tsx                  Admin: manage channels, bridge, cleanup
    preferences/page.tsx               User: language preferences
    auth/
      callback/route.ts               OAuth callback (invite code enforcement)
      signout/route.ts                Sign out
    api/
      webhooks/telegram/route.ts       Telegram incoming messages
      webhooks/discord/route.ts        Discord incoming (from worker)
      webhooks/slack/route.ts          Slack Events API
      webhooks/whatsapp/route.ts       WhatsApp Cloud API webhooks
      messages/send/route.ts           Outgoing message router (single + batch)
      messages/clear/route.ts          Admin: delete all messages from app
      translate/route.ts               Google Translate proxy
      connections/telegram/route.ts    Connect Telegram channel
      connections/discord/route.ts     Connect Discord channel
      connections/slack/callback/      Slack OAuth callback
      connections/whatsapp/route.ts    Connect WhatsApp number
      connections/[id]/route.ts        Delete connection
  components/
    chat-layout-wrapper.tsx            Mobile sidebar drawer wrapper
    chat-sidebar.tsx                   Channel list + user info + preferences
    unified-view.tsx                   All-platform message view + Realtime
    conversation-view.tsx              Per-platform message thread
    message-bubble.tsx                 Message with image + translate + bridge indicator
    join-form.tsx                      Invite code / sign-in flow
    admin-settings.tsx                 Channel management, bridge toggle, clear messages
    user-preferences.tsx               Language selector for all users
    platform-icons.tsx                 SVG icons (Telegram, Discord, Slack, WhatsApp)
    tos-accept-button.tsx              TOS acceptance
  lib/
    supabase/client.ts                 Browser Supabase client (singleton)
    supabase/server.ts                 Server + Service Role clients
    telegram.ts                        Telegram Bot API helpers
    discord.ts                         Discord REST API helpers
    slack.ts                           Slack Web API helpers
    whatsapp.ts                        WhatsApp Cloud API helpers
    bridge.ts                          Cross-platform message bridging engine
    translate.ts                       Google Translate wrapper
    platforms.ts                       Unified send interface (all 4 platforms)
    types.ts                           TypeScript types
  discord-worker/
    index.js                           Standalone Discord gateway bot (Railway)
    package.json
  supabase/
    migration.sql                      Full database schema + RLS
  docs/
    whatsapp-setup.md                  WhatsApp Cloud API setup guide
  middleware.ts                        Auth guard + TOS enforcement
```

## Setup Guide

### Prerequisites

- Node.js 18+
- A Supabase account (free or pro)
- A Vercel account
- A Railway account (for Discord bot)
- Platform accounts: Telegram, Discord, Slack, and/or WhatsApp

### Step 1: Clone and Install

```bash
git clone https://github.com/Delta3Palash/ERA37.git
cd ERA37
npm install
```

### Step 2: Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **SQL Editor** and paste the contents of `supabase/migration.sql` — run it
3. Go to **Settings > API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

4. **Enable OAuth providers** in **Authentication > Providers**:
   - **Google**: Create credentials at [console.cloud.google.com](https://console.cloud.google.com/apis/credentials). Set redirect URI to `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
   - **Discord**: Create app at [discord.com/developers](https://discord.com/developers/applications). Add redirect URI same as above
   - **Slack**: Create app at [api.slack.com/apps](https://api.slack.com/apps). Use `slack_oidc` provider. Add redirect URI same as above

5. In **Authentication > URL Configuration**, set Site URL to your Vercel domain (or `http://localhost:3000` for dev)

### Step 3: Environment Variables

```bash
cp .env.local.example .env.local
```

Fill in your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

GOOGLE_TRANSLATE_API_KEY=AIza...
WHATSAPP_APP_SECRET=your-meta-app-secret  # optional, for webhook signature validation
NEXT_PUBLIC_KLIPY_API_KEY=your-klipy-api-key  # optional, enables GIF picker

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 4: Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`. You should see the ERA37 landing page.

### Step 5: Create Your Admin Account

1. Visit `/join` and enter the invite code (check `workspace` table in Supabase for the auto-generated code)
2. Sign in with any OAuth provider
3. Accept the Terms of Service
4. In Supabase **SQL Editor**, make yourself admin:

```sql
UPDATE profiles SET is_admin = true
WHERE display_name = 'Your Name';
```

5. Now visit `/settings` — you'll see the admin panel

### Step 6: Connect Telegram

1. Open Telegram, message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, get your **bot token**
3. Add the bot to your Telegram group
4. Get the **chat ID** of the group:
   - Add `@RawDataBot` to the group, it will print the chat ID (starts with `-100...`)
   - Remove `@RawDataBot` after
5. In ERA37 **Settings**, enter the bot token, chat ID, and a name
6. Click **Connect**

### Step 7: Connect Discord

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Create a new application, go to **Bot** section
3. Click **Reset Token** and copy the **bot token**
4. Enable **Message Content Intent** under Privileged Gateway Intents
5. Go to **OAuth2 > URL Generator**, select `bot` scope with permissions: Read Messages, Send Messages, Read Message History
6. Open the generated URL to add the bot to your server
7. Right-click the target channel in Discord > **Copy Channel ID** (enable Developer Mode in Discord settings if needed)
8. In ERA37 **Settings**, enter the bot token, channel ID, and a name
9. Click **Connect**

### Step 8: Connect Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps), create a new app (post-June 2024 for OIDC support)
2. Under **OAuth & Permissions**, add scopes: `channels:history`, `channels:read`, `chat:write`, `users:read`
3. Under **Event Subscriptions**:
   - Enable events
   - Set Request URL to `https://your-domain.vercel.app/api/webhooks/slack`
   - Subscribe to `message.channels` event
4. Copy **Client ID**, **Client Secret**, and **Signing Secret** to your env vars
5. In ERA37 **Settings**, click **Add to Slack** and authorize

### Step 9: Connect WhatsApp (Optional)

See the detailed guide: [`docs/whatsapp-setup.md`](docs/whatsapp-setup.md)

Requires a Meta Business account with WhatsApp Cloud API access.

### Step 10: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com), import the `Delta3Palash/ERA37` GitHub repo
2. Add all environment variables from `.env.local` (change `NEXT_PUBLIC_APP_URL` to your Vercel domain)
3. Deploy

After deploying, update:
- Supabase **Site URL** to your Vercel domain
- Telegram webhook will auto-update on next connection
- Slack **Request URL** to `https://your-domain.vercel.app/api/webhooks/slack`

### Step 11: Deploy Discord Worker to Railway

1. Go to [railway.app](https://railway.app), create a new project
2. Select **Deploy from GitHub repo** > choose `ERA37`
3. Set the **Root Directory** to `discord-worker`
4. Add environment variables:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
APP_WEBHOOK_URL=https://your-domain.vercel.app/api/webhooks/discord
WEBHOOK_SECRET=your-discord-webhook-secret
```

> **Important:** `APP_WEBHOOK_URL` must be set for message bridging to work from Discord. Without it, the worker writes directly to Supabase and bridging is skipped.

5. Deploy — the worker will start listening to your configured Discord channel

### Step 12: Enable Message Bridging (Optional)

1. Go to ERA37 **Settings**
2. Toggle **Bridge messages across platforms** ON
3. Messages from any platform will now auto-forward to all other connected platforms

### Step 13: Share the Invite Link

1. Go to ERA37 **Settings** and copy the invite link
2. Share it with your team — they'll need the invite code for first signup
3. After their first login, they can sign in directly without the invite code
4. Everyone sees the same conversations across all connected platforms

## Google Cloud Translation Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the **Cloud Translation API**
3. Create an API key under **APIs & Services > Credentials**
4. Add the key as `GOOGLE_TRANSLATE_API_KEY`
5. Free tier: 500,000 characters/month

## Environment Variables Reference

| Variable | Where | Required |
|----------|-------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Yes |
| `NEXT_PUBLIC_APP_URL` | Vercel | Yes |
| `GOOGLE_TRANSLATE_API_KEY` | Vercel | Yes |
| `DISCORD_WEBHOOK_SECRET` | Vercel | Yes (if Discord connected) |
| `SLACK_SIGNING_SECRET` | Vercel | Yes (if Slack connected) |
| `NEXT_PUBLIC_SLACK_CLIENT_ID` | Vercel | Yes (if Slack connected) |
| `SLACK_CLIENT_SECRET` | Vercel | Yes (if Slack connected) |
| `WHATSAPP_APP_SECRET` | Vercel | Optional (webhook signature validation) |
| `NEXT_PUBLIC_KLIPY_API_KEY` | Vercel | Optional (enables GIF picker) |
| `SUPABASE_URL` | Railway | Yes |
| `SUPABASE_SERVICE_KEY` | Railway | Yes |
| `APP_WEBHOOK_URL` | Railway | Yes (required for bridging) |
| `WEBHOOK_SECRET` | Railway | Yes |

## Cost

| Service | Monthly Cost |
|---------|-------------|
| Vercel | $0 (hobby) or $20 (pro) |
| Supabase | $0 (free) or $25 (pro) |
| Railway | $5 (hobby) |
| Telegram Bot API | $0 |
| Discord Bot API | $0 |
| Slack API | $0 |
| WhatsApp Cloud API | $0 (1,000 conversations/month free) |
| Google Translate | $0 (500K chars free) |
| KLIPY GIF API | $0 (free tier) |

## License

MIT
