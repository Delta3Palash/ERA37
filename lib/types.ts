export type Platform = "telegram" | "discord" | "slack" | "whatsapp";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_language: string;
  auto_translate: boolean;
  is_admin: boolean;
  tos_accepted_at: string | null;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  invite_code: string;
  invite_enabled: boolean;
  bridge_enabled: boolean;
  created_at: string;
}

export interface Connection {
  id: string;
  platform: Platform;
  platform_channel_id: string;
  channel_name: string | null;
  bot_token: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  connection_id: string;
  platform: Platform;
  platform_message_id: string | null;
  platform_channel_id: string;
  sender_name: string | null;
  sender_avatar: string | null;
  content: string | null;
  image_url: string | null;
  translated_content: string | null;
  translated_language: string | null;
  direction: "incoming" | "outgoing" | "bridged";
  sent_by: string | null;
  message_type: string;
  metadata: Record<string, unknown>;
  reply_to_message_id: string | null;
  created_at: string;
  connection?: Connection;
}
