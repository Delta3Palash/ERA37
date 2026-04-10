export type Platform = "telegram" | "discord" | "slack" | "whatsapp";

export interface Profile {
  id: string;
  display_name: string | null;
  preferred_language: string;
  created_at: string;
}

export interface Invitation {
  id: string;
  code: string;
  created_by: string | null;
  used_by: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface Connection {
  id: string;
  user_id: string;
  platform: Platform;
  platform_user_id: string;
  platform_username: string | null;
  bot_token: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  connection_id: string;
  platform: Platform;
  platform_chat_id: string;
  chat_name: string | null;
  last_message_at: string | null;
  unread_count: number;
  metadata: Record<string, unknown>;
  connection?: Connection;
}

export interface Message {
  id: string;
  user_id: string;
  connection_id: string;
  chat_id: string;
  platform: Platform;
  platform_message_id: string | null;
  platform_chat_id: string;
  chat_name: string | null;
  sender_name: string | null;
  content: string | null;
  translated_content: string | null;
  translated_language: string | null;
  direction: "incoming" | "outgoing";
  message_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
