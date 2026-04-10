-- ERA37 Database Schema v2 — Shared Workspace Model
-- Run this in Supabase SQL Editor

-- Profiles (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT DEFAULT 'en',
  is_admin BOOLEAN DEFAULT false,
  tos_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup (handles OAuth + email)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'display_name',
      NEW.email
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Workspace settings (single row — app config)
CREATE TABLE IF NOT EXISTS workspace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT DEFAULT 'ERA37',
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  invite_enabled BOOLEAN DEFAULT true,
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
  direction TEXT CHECK (direction IN ('incoming', 'outgoing')),
  sent_by UUID REFERENCES profiles(id),
  message_type TEXT DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
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
