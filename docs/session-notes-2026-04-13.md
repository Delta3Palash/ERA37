# ERA37 Session Notes — 2026-04-13

## What was built/fixed:

### Slack → Telegram Bridge Fix
- Root cause: `parse_mode: "HTML"` in Telegram's sendMessage was rejecting Slack messages containing angle brackets (`<@U123>`, `<https://...>`)
- Fix: Removed parse_mode, now sends as plain text

### GIF Picker (KLIPY)
- Tenor API deprecated (Jan 2026, shutdown June 2026) — switched to KLIPY (built by ex-Tenor team, free API)
- `lib/tenor.ts` — KLIPY API helpers (search + trending)
- `components/gif-picker.tsx` — search panel with debounced search, trending grid, click-to-send
- GIF button in both unified-view and conversation-view
- Send route updated to accept `imageUrl` param and store in DB
- Env var: `NEXT_PUBLIC_KLIPY_API_KEY`

### Discord-Style UI Redesign
- Flat left-aligned messages (removed chat bubbles)
- 40px avatars with letter-initial fallback
- Sender name + timestamp on header line
- Message grouping: consecutive messages from same sender within 5 min collapse
- Translate button appears on hover only (cleaner default state)
- Translation shown with amber left-border accent
- **Colored usernames** — 12-color palette, deterministic hash per name (like Discord)
- Initial-fallback avatars match username color

### Send to All — Default + Collapsed
- "All" is now the default send mode
- Individual platform buttons hidden behind a popup picker
- Click "All" to open picker, select platform, click "All" again to go back to broadcast

### Sidebar Platforms Dropdown
- Individual channels collapsed into "▸ Platforms (3)" toggle
- "All Messages" always visible at top

### Message Deduplication
- "Send to All" creates one outgoing message per platform — was showing 3x after UI redesign
- Added inline dedup filter: consecutive outgoing with same content/sender within 2s → show once

### Unified View Message Loading
- Removed 200 message limit (was cutting off recent messages)
- Query now excludes bridged messages at DB level (was wasting limit on hidden rows)
- Fixed ascending/descending order issue

### Outgoing Messages Retained
- Outgoing messages were hidden after filtering to "incoming only" — reverted to show both incoming + outgoing, hide only bridged

### Invite Code Enforcement (Server-Side)
- Auth callback now checks for existing profile
- New users rejected unless they came through invite code flow
- Shows "No account found" error for unauthorized signups

### Telegram Display Name
- Uses `username` instead of `first_name + last_name`

### Discord @Mentions Resolved
- Discord worker uses `message.cleanContent` instead of `message.content`
- `<@USER_ID>` → `@DisplayName`

### Admin Clear Messages
- DELETE /api/messages/clear endpoint
- "Danger Zone" section in admin settings with two-click confirmation

### User Preferences Page
- /preferences accessible to all users (globe icon in sidebar)
- Language selector for translation

### Realtime Reliability
- Supabase client singleton
- useMemo for stable reference
- Visibility-based refetch on tab focus

### Auto-Translation (removed)
- Was unreliable due to stale closures
- Removed in favor of manual translate button

## Key Files Changed:
- `components/message-bubble.tsx` — Discord-style layout, colored usernames, hover-to-translate
- `components/unified-view.tsx` — message loading, dedup, platform picker, GIF button
- `components/conversation-view.tsx` — same view updates, GIF button
- `components/chat-sidebar.tsx` — collapsible platforms, preferences link
- `components/gif-picker.tsx` — new KLIPY GIF picker
- `lib/tenor.ts` — KLIPY API (renamed from Tenor)
- `lib/telegram.ts` — removed parse_mode: "HTML"
- `app/api/messages/send/route.ts` — imageUrl support
- `app/api/messages/clear/route.ts` — admin clear
- `app/auth/callback/route.ts` — server-side invite enforcement
- `discord-worker/index.js` — cleanContent for mentions

---

## Priority Task List (Next Session):

### 1. Reply Threading (high priority — ~30-45 min)
- Capture reply metadata from each platform:
  - Discord: `message.reference?.messageId`
  - Telegram: `msg.reply_to_message`
  - Slack: `event.thread_ts`
- Add `reply_to_message_id` column to messages table
- Lookup parent message by `platform_message_id` → get ERA37 message ID
- UI: render compact quoted reply bar above message ("↩ @User text preview...")

### 2. @Mentions System
- Autocomplete dropdown when typing `@`
- Map ERA37 users to platform user IDs
- Convert to platform-specific format before sending
- In-app notification for mentioned users

### 3. UI/UX Improvements
- Message reactions (emoji react bar)
- Link previews (auto-detect URLs, show title/image)
- Message search/filtering
- Unread message indicator / scroll-to-new
- Better mobile touch interactions

### 4. Auto-Translation (revisit)
- Server-side approach (in webhooks) instead of client-side
- Or Supabase Edge Functions for async translation

### 5. Future Features (lower priority)
- File/document sharing (not just images)
- Read receipts / typing indicators
- User roles beyond admin/non-admin
- Message pagination if performance degrades
- WhatsApp connection (code ready, blocked by Meta — `docs/whatsapp-setup.md`)

---

## Env Vars on Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_TRANSLATE_API_KEY`
- `NEXT_PUBLIC_APP_URL`
- `DISCORD_BOT_TOKEN`, `DISCORD_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`
- `NEXT_PUBLIC_KLIPY_API_KEY` (GIF picker)
- `WHATSAPP_APP_SECRET` (when WhatsApp connected)

## Env Vars on Railway:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `APP_WEBHOOK_URL` — must be set for bridging
- `WEBHOOK_SECRET`

## Supabase Project:
- `cyhkiszcgnndvliusazb.supabase.co`
