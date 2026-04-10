"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare,
  Settings,
  LogOut,
  Plus,
  Send as SendIcon,
  Hash,
} from "lucide-react";
import { TelegramIcon, DiscordIcon, SlackIcon } from "./platform-icons";
import type { Chat, Connection, Profile, Platform } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

interface ChatSidebarProps {
  userId: string;
  profile: Profile | null;
  connections: Connection[];
}

export function ChatSidebar({ userId, profile, connections }: ChatSidebarProps) {
  const [chats, setChats] = useState<(Chat & { connection?: Connection })[]>([]);
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    loadChats();

    const channel = supabase
      .channel("chats-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chats", filter: `user_id=eq.${userId}` },
        () => loadChats()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  async function loadChats() {
    const { data } = await supabase
      .from("chats")
      .select("*, connection:connections(*)")
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (data) setChats(data);
  }

  function getPlatformIcon(platform: Platform) {
    switch (platform) {
      case "telegram": return <TelegramIcon className="w-4 h-4" />;
      case "discord": return <DiscordIcon className="w-4 h-4" />;
      case "slack": return <SlackIcon className="w-4 h-4" />;
      default: return <Hash className="w-4 h-4" />;
    }
  }

  return (
    <aside className="w-72 flex flex-col bg-surface border-r border-border h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-bold">
          ERA<span className="text-accent">37</span>
        </h1>
        <div className="flex gap-1">
          <button
            onClick={() => router.push("/settings")}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-muted hover:text-foreground"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Platform filters */}
      {connections.length > 0 && (
        <div className="px-3 py-2 flex gap-1 border-b border-border">
          {connections.map((conn) => (
            <span
              key={conn.id}
              className={`platform-${conn.platform} text-xs px-2 py-1 rounded-full border border-current opacity-70`}
            >
              {conn.platform}
            </span>
          ))}
        </div>
      )}

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="p-4 text-center text-muted text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No conversations yet</p>
            <p className="text-xs mt-1">Connect a platform to get started</p>
          </div>
        ) : (
          chats.map((chat) => {
            const isActive = pathname === `/chat/${chat.id}`;
            return (
              <button
                key={chat.id}
                onClick={() => router.push(`/chat/${chat.id}`)}
                className={`w-full text-left p-3 flex items-start gap-3 hover:bg-surface-hover transition-colors border-b border-border/50 ${
                  isActive ? "bg-surface-hover" : ""
                }`}
              >
                <div className={`platform-${chat.platform} mt-0.5`}>
                  {getPlatformIcon(chat.platform)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">
                      {chat.chat_name || "Unknown Chat"}
                    </span>
                    {chat.unread_count > 0 && (
                      <span className="ml-2 text-xs bg-accent text-black rounded-full px-1.5 py-0.5 font-medium">
                        {chat.unread_count}
                      </span>
                    )}
                  </div>
                  {chat.last_message_at && (
                    <span className="text-xs text-muted">
                      {formatDistanceToNow(new Date(chat.last_message_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* User info */}
      <div className="p-3 border-t border-border flex items-center justify-between">
        <span className="text-sm text-muted truncate">
          {profile?.display_name || "User"}
        </span>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-muted hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
