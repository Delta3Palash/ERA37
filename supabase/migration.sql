-- ERA37 Database Schema v2 — Shared Workspace Model
-- Run this in Supabase SQL Editor

-- Profiles (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT DEFAULT 'en',
  auto_translate BOOLEAN DEFAULT false,
  is_admin BOOLEAN DEFAULT false,
  tos_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- NOTE: Profile creation is handled in app code (auth/callback/route.ts)
-- No database trigger needed — this avoids "Database error saving new user" issues

-- Workspace settings (single row — app config)
CREATE TABLE IF NOT EXISTS workspace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT DEFAULT 'ERA37',
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  invite_enabled BOOLEAN DEFAULT true,
  bridge_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default workspace
INSERT INTO workspace (name) VALUES ('ERA37') ON CONFLICT DO NOTHING;

-- Connected platform channels (workspace-level, admin configures)
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'discord', 'slack', 'whatsapp')),
  platform_channel_id TEXT NOT NULL,
  channel_name TEXT,
  bot_token TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, platform_channel_id)
);

-- Unified messages (shared — all users see all messages)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_message_id TEXT,
  platform_channel_id TEXT NOT NULL,
  sender_name TEXT,
  sender_avatar TEXT,
  content TEXT,
  image_url TEXT,
  translated_content TEXT,
  translated_language TEXT,
  direction TEXT CHECK (direction IN ('incoming', 'outgoing', 'bridged')),
  sent_by UUID REFERENCES profiles(id),
  message_type TEXT DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
  reply_to_message_id UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_connection ON messages(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connections_platform ON connections(platform);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Profiles: users see own, admins see all
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Workspace: public read (invite code check happens before login)
CREATE POLICY "Anyone can view workspace" ON workspace
  FOR SELECT USING (true);
CREATE POLICY "Admins can update workspace" ON workspace
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Connections: all authenticated users can read, admins can manage
CREATE POLICY "Authenticated users can view connections" ON connections
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage connections" ON connections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Messages: all authenticated users can read and send
CREATE POLICY "Authenticated users can view messages" ON messages
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can send messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own message translations" ON messages
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Enable Realtime on messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Storage bucket for user-uploaded images
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-images', 'chat-images', true)
  ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload images
CREATE POLICY "Authenticated users can upload images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat-images' AND auth.uid() IS NOT NULL);

-- Anyone can view uploaded images (public bucket)
CREATE POLICY "Public read access for chat images" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-images');

-- =============================================================
-- Phase 1: Custom Roles + Channel Groups
-- =============================================================
-- Safe to re-run. All additions are idempotent (IF NOT EXISTS /
-- ON CONFLICT). is_admin on profiles is untouched — roles are
-- orthogonal to the superadmin flag.

-- Custom roles (R5, R4, Rally Leader, Scout, Diplomat, ...)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#737373',
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Multi-role per user
CREATE TABLE IF NOT EXISTS profile_roles (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id)    ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (profile_id, role_id)
);

-- Channel groups ("General", "R4 Officers", "R5 Leadership", ...)
CREATE TABLE IF NOT EXISTS channel_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_role_priority INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Many-to-many: a connection can belong to multiple groups
CREATE TABLE IF NOT EXISTS channel_group_connections (
  group_id      UUID NOT NULL REFERENCES channel_groups(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id)    ON DELETE CASCADE,
  PRIMARY KEY (group_id, connection_id)
);

-- Bootstrap: default "Member" role (priority 0)
INSERT INTO roles (name, color, priority)
  VALUES ('Member', '#737373', 0)
  ON CONFLICT (name) DO NOTHING;

-- Bootstrap: default "General" group (min priority 0)
INSERT INTO channel_groups (name, min_role_priority, sort_order)
  SELECT 'General', 0, 0
  WHERE NOT EXISTS (SELECT 1 FROM channel_groups WHERE name = 'General');

-- Backfill: attach every existing connection to the General group
INSERT INTO channel_group_connections (group_id, connection_id)
  SELECT (SELECT id FROM channel_groups WHERE name = 'General' LIMIT 1), c.id
  FROM connections c
  ON CONFLICT DO NOTHING;

-- Backfill: give every existing user the Member role
INSERT INTO profile_roles (profile_id, role_id)
  SELECT p.id, (SELECT id FROM roles WHERE name = 'Member' LIMIT 1)
  FROM profiles p
  ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profile_roles_profile ON profile_roles(profile_id);
CREATE INDEX IF NOT EXISTS idx_cgc_group ON channel_group_connections(group_id);
CREATE INDEX IF NOT EXISTS idx_cgc_connection ON channel_group_connections(connection_id);

-- RLS
ALTER TABLE roles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_group_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read roles" ON roles;
CREATE POLICY "Auth read roles" ON roles
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins manage roles" ON roles;
CREATE POLICY "Admins manage roles" ON roles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Auth read profile_roles" ON profile_roles;
CREATE POLICY "Auth read profile_roles" ON profile_roles
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins manage profile_roles" ON profile_roles;
CREATE POLICY "Admins manage profile_roles" ON profile_roles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Auth read channel_groups" ON channel_groups;
CREATE POLICY "Auth read channel_groups" ON channel_groups
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins manage channel_groups" ON channel_groups;
CREATE POLICY "Admins manage channel_groups" ON channel_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Auth read channel_group_connections" ON channel_group_connections;
CREATE POLICY "Auth read channel_group_connections" ON channel_group_connections
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins manage channel_group_connections" ON channel_group_connections;
CREATE POLICY "Admins manage channel_group_connections" ON channel_group_connections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- =============================================================
-- Phase 1.5: Delegated role management
-- =============================================================
-- Roles marked `can_manage = true` allow their holders to access the
-- admin UI with a scoped view: they can manage users, roles, and
-- channel groups STRICTLY below their own effective priority. Enforcement
-- happens in API routes — RLS stays as-is (admin_manage policies above
-- still require is_admin because they're used for service-client writes).

ALTER TABLE roles ADD COLUMN IF NOT EXISTS can_manage BOOLEAN NOT NULL DEFAULT false;

-- =============================================================
-- Phase 2: Calendar (Game + Alliance + Miscellaneous)
-- =============================================================
-- Three views behind a single /calendar route:
--   - Game: admin uploads weekly screenshots of the in-game event calendar
--   - Alliance: typed events (growth/attack/defense/rally) with an R4 owner
--   - Misc: same shape as Alliance but created by R5s to assign ad-hoc tasks
-- Writes are gated at the API layer via lib/access.ts — RLS here only
-- guards reads and keeps service-client writes on the fast path.

-- Per-user timezone for rendering event times
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_timezone TEXT DEFAULT 'UTC';

-- Game calendar: one row per uploaded screenshot, grouped by week_start
CREATE TABLE IF NOT EXISTS game_calendar_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_game_cal_week ON game_calendar_images(week_start DESC);

-- Alliance + misc events share a table, distinguished by `kind`
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('alliance', 'misc')),
  event_type TEXT NOT NULL CHECK (event_type IN ('growth', 'attack', 'defense', 'rally')),
  title TEXT NOT NULL,
  details TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cal_events_starts ON calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_cal_events_kind_starts ON calendar_events(kind, starts_at);

-- Storage bucket for game screenshots
INSERT INTO storage.buckets (id, name, public)
  VALUES ('calendar-screenshots', 'calendar-screenshots', true)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE game_calendar_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read game_calendar_images" ON game_calendar_images;
CREATE POLICY "Auth read game_calendar_images" ON game_calendar_images
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth read calendar_events" ON calendar_events;
CREATE POLICY "Auth read calendar_events" ON calendar_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Storage: public read, authenticated insert (API route further restricts
-- inserts/deletes to is_admin).
DROP POLICY IF EXISTS "Auth upload calendar screenshots" ON storage.objects;
CREATE POLICY "Auth upload calendar screenshots" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'calendar-screenshots' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Public read calendar screenshots" ON storage.objects;
CREATE POLICY "Public read calendar screenshots" ON storage.objects
  FOR SELECT USING (bucket_id = 'calendar-screenshots');

-- =============================================================
-- Phase 2.1: Game events become structured, assignable rows
-- =============================================================
-- Originally the Game tab was screenshot-only. Users needed to assign R4s
-- to individual game events, which requires structured rows. Extend the
-- kind enum to include 'game' — existing alliance/misc rows are
-- unaffected. Screenshots are still uploaded for visual reference.

ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_kind_check;
ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_kind_check
  CHECK (kind IN ('alliance', 'misc', 'game'));

-- =============================================================
-- Phase 2.2: Team Clock — R4 availability + configurable timezone rings
-- =============================================================
-- A radial clock visualization that helps R5s see which R4s are reachable at
-- any given UTC hour, across multiple local timezones. Based on the alliance's
-- existing French "Fuseaux horaires" spreadsheet.
--
-- Data model:
--   profiles.availability_utc JSONB
--     Per-weekday arrays of UTC hours (0-23) the user is online.
--     Shape: { mon: [0,1,20,21,22,23], tue: [...], ..., sun: [...] }
--     Empty {} = unknown / not yet configured. NULL treated same as empty.
--
--   team_clock_timezones (rows)
--     The IANA zones rendered as concentric rings. R5 curates this list.
--     Seeded with the six from the spreadsheet.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS availability_utc JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS team_clock_timezones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iana TEXT NOT NULL UNIQUE,   -- e.g. 'America/Los_Angeles'
  label TEXT NOT NULL,         -- e.g. 'Los Angeles'
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_clock_tz_sort ON team_clock_timezones(sort_order);

ALTER TABLE team_clock_timezones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read team_clock_timezones" ON team_clock_timezones;
CREATE POLICY "Auth read team_clock_timezones" ON team_clock_timezones
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Writes go through service-client API routes gated on is_admin.

-- Seed with the defaults from the original spreadsheet. ON CONFLICT so this
-- is idempotent on re-run.
INSERT INTO team_clock_timezones (iana, label, sort_order) VALUES
  ('America/Los_Angeles', 'Los Angeles',  10),
  ('America/New_York',   'New York',      20),
  ('Europe/London',      'London',        30),
  ('Europe/Paris',       'Paris',         40),
  ('Europe/Istanbul',    'Istanbul',      50),
  ('Asia/Dubai',         'Dubai',         60),
  ('Asia/Kolkata',       'India',         70),
  ('Asia/Hong_Kong',     'Hong Kong',     80),
  ('Asia/Seoul',         'Seoul',         90),
  ('Australia/Sydney',   'Sydney',       100)
ON CONFLICT (iana) DO NOTHING;

-- =============================================================
-- Phase 2.3: In-app notifications for calendar event assignments
-- =============================================================
-- Triggered by the POST/PATCH routes on calendar_events. When an R4 is
-- assigned to an event (or reassigned / unassigned), we insert a row here
-- for the affected profile(s). The UI's notification bell subscribes via
-- Realtime so the alert appears immediately without a page refresh.
--
-- Rows auto-cascade on profile or event deletion.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('event_assigned', 'event_unassigned')),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  -- Where clicking the notification should land the user. Kept denormalised
  -- so deleting an event doesn't break the link for historical entries.
  link_href TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unread-first index: most queries are "latest 20 for me, unread at top".
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications(recipient_id, read_at NULLS FIRST, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users see only their own notifications. Writes happen via the service
-- client inside API routes, so no public INSERT policy is needed. The
-- UPDATE policy covers "mark as read".
DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications" ON notifications
  FOR SELECT USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (recipient_id = auth.uid());

-- Realtime: broadcast INSERTs so the bell can refresh without polling.
-- Safe to re-run — supabase_realtime is an append-only publication; adding
-- the same table twice no-ops.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
