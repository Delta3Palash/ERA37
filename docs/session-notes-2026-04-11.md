# ERA37 Session Notes — 2026-04-11

## What was built/fixed:

### Invite Code — First Signup Only
- Split `/join` page into signup mode (invite code required) and login mode (skip to OAuth)
- Landing page now has "Get Started" (new users) and "Sign In" (returning users) buttons
- **Server-side enforcement** in auth callback: new users without existing profile are rejected unless they came through invite code flow (`signup=1` flag)
- Shows "No account found" error when new users try to sign in without invite code

### WhatsApp Integration
- `lib/whatsapp.ts` — send messages, verify webhook signatures, get media URLs via Cloud API v21.0
- `app/api/webhooks/whatsapp/route.ts` — GET (webhook verification) + POST (incoming messages)
- `app/api/connections/whatsapp/route.ts` — admin connection setup with credential verification
- WhatsApp icon added to all UI components (sidebar, unified view, conversation view)
- `WhatsAppChannelSetup` component in admin settings with Meta Business setup hints
- CSS variables already existed (`--whatsapp: #25D366`)
- **Blocked by Meta**: Business portfolio has advertising restriction, preventing app creation. Instructions saved in `docs/whatsapp-setup.md`

### Auto-Translation (built then removed)
- Built auto-translate feature with per-user toggle and `auto_translate` profile column
- Had persistent issues: stale closures in Realtime callbacks, sporadic behavior
- **Removed** in favor of reliable manual translate button (click icon per message)
- DB column `auto_translate` remains but is unused
- User preferences page (`/preferences`) still exists for language selection

### Message Bridging
- `lib/bridge.ts` — checks `workspace.bridge_enabled`, forwards to all other connections
- All 4 webhook handlers call `bridgeMessage()` after inserting incoming messages
- Bridge calls wrapped in separate try-catch so failures don't break webhook responses
- Format: `[Discord] SenderName: message content`
- Loop prevention:
  - Discord: worker already skips bot messages (`message.author.bot`)
  - Slack: filters `event.bot_id` and `event.subtype`
  - Telegram: added `msg.from.is_bot` check
  - WhatsApp: webhook payload only contains user-sent messages (safe by design)
- Bridged messages stored with `direction: "bridged"` and `metadata.source_platform`
- UI shows bridge indicator (⇄ icon) with "via {platform}" text
- Admin toggle in Settings under "Message Bridging" section
- **Discord → others was initially broken** because Railway worker's `APP_WEBHOOK_URL` wasn't set, causing direct-to-Supabase writes that bypassed bridging. Fixed with fallback bridge call in worker.

### Telegram Display Name
- Changed from `first_name + last_name` (full name) to `username` (display name like "PG_Archer_13")
- Falls back to `first_name` if no username set

### Admin Clear Messages
- `DELETE /api/messages/clear` endpoint (admin-only)
- "Danger Zone" section at bottom of admin settings
- Two-click confirmation: "Clear all messages" → "Yes, clear all messages"
- Only deletes from ERA37 database — does not touch Discord/Slack/Telegram/WhatsApp

### User Preferences Page
- New `/preferences` page accessible to all users (globe icon in sidebar footer)
- Language selector for translation
- Visible to all users, not just admins

### Realtime Reliability
- Supabase client now returns a cached singleton (was creating new instances on every render)
- Components use `useMemo` for stable Supabase reference
- Added visibility-based refetch: when tab becomes visible, messages are refetched to catch anything missed while WebSocket was disconnected
- Dependency arrays use stable `connectionIds` string instead of `connections.length`

### Database Schema Changes
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_translate BOOLEAN DEFAULT false;
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS bridge_enabled BOOLEAN DEFAULT false;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_direction_check;
ALTER TABLE messages ADD CONSTRAINT messages_direction_check 
  CHECK (direction IN ('incoming', 'outgoing', 'bridged'));
```

## Still Pending:

### WhatsApp Connection
- Code is complete and deployed
- Blocked by Meta Business portfolio restriction ("Business is not allowed to claim App")
- Need to resolve at [business.facebook.com/settings/security](https://business.facebook.com/settings/security) — couldn't do it while traveling (IP mismatch)
- Full setup instructions in `docs/whatsapp-setup.md`

### Auto-Translation (future)
- Manual translate works perfectly
- Auto-translate was unreliable due to Realtime callback closure issues
- Could revisit with a different approach (server-side in webhooks, or Supabase Edge Functions)

### @Mentions System
- Autocomplete dropdown when typing `@` in ERA37 (list workspace members + platform users)
- Map ERA37 users to their platform user IDs
- Convert `@name` to platform-specific mention format before sending (`<@USER_ID>` for Discord, `<@U123>` for Slack, etc.)
- In-app notification for mentioned users

### Potential Improvements
- Message search/filtering
- Read receipts / typing indicators
- File/document sharing (not just images)
- User roles beyond admin/non-admin
- Multi-workspace support
- Message reactions
- Message pagination (load more) if performance degrades

## Key Files Changed This Session:
- `app/auth/callback/route.ts` — server-side invite code enforcement
- `components/join-form.tsx` — signup/login mode split
- `lib/whatsapp.ts` — WhatsApp Cloud API (new)
- `lib/bridge.ts` — cross-platform bridging engine (new)
- `lib/supabase/client.ts` — singleton pattern fix
- `components/unified-view.tsx` — Realtime reliability, bridged messages
- `components/admin-settings.tsx` — WhatsApp setup, bridge toggle, clear messages
- `components/user-preferences.tsx` — language selector for all users (new)
- `discord-worker/index.js` — bridge fallback for direct-to-Supabase path
- All 4 webhook routes — bridge calls with separate error handling

## Env Vars on Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_TRANSLATE_API_KEY`
- `NEXT_PUBLIC_APP_URL` (Vercel domain)
- `DISCORD_BOT_TOKEN`, `DISCORD_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`
- `WHATSAPP_APP_SECRET` (add when WhatsApp is connected)

## Env Vars on Railway (Discord Worker):
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `APP_WEBHOOK_URL` — **must be set** for bridging to work from Discord
- `WEBHOOK_SECRET`

## Supabase Project:
- `cyhkiszcgnndvliusazb.supabase.co`
