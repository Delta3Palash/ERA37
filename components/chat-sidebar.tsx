"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare,
  Settings,
  LogOut,
  Hash,
} from "lucide-react";
import { TelegramIcon, DiscordIcon, SlackIcon } from "./platform-icons";
import type { Connection, Profile, Platform } from "@/lib/types";

interface ChatSidebarProps {
  userId: string;
  profile: Profile | null;
  connections: Connection[];
  isAdmin: boolean;
}

export function ChatSidebar({ userId, profile, connections, isAdmin }: ChatSidebarProps) {
  const [activeConnections, setActiveConnections] = useState(connections);
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Listen for new connections
    const channel = supabase
      .channel("connections-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connections" },
        () => loadConnections()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadConnections() {
    const { data } = await supabase
      .from("connections")
      .select("*")
      .order("platform");
    if (data) setActiveConnections(data);
  }

  function getPlatformIcon(platform: Platform, size = "w-5 h-5") {
    switch (platform) {
      case "telegram": return <TelegramIcon className={size} />;
      case "discord": return <DiscordIcon className={size} />;
      case "slack": return <SlackIcon className={size} />;
      default: return <Hash className={size} />;
    }
  }

  return (
    <aside className="w-72 flex flex-col bg-surface border-r border-border h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-bold">
          ERA<span className="text-accent">37</span>
        </h1>
        {isAdmin && (
          <button
            onClick={() => router.push("/settings")}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-muted hover:text-foreground"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {/* Unified view */}
        {activeConnections.length > 0 && (
          <button
            onClick={() => router.push("/chat/all")}
            className={`w-full text-left p-3 flex items-center gap-3 hover:bg-surface-hover transition-colors ${
              pathname === "/chat/all" ? "bg-surface-hover border-l-2 border-accent" : "border-l-2 border-transparent"
            }`}
          >
            <MessageSquare className="w-5 h-5 text-accent" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold truncate block">All Messages</span>
              <span className="text-xs text-muted">Unified timeline</span>
            </div>
          </button>
        )}

        <div className="px-3 pt-3 pb-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wider">
            Platforms
          </span>
        </div>

        {activeConnections.length === 0 ? (
          <div className="p-4 text-center text-muted text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No channels connected</p>
            {isAdmin && (
              <p className="text-xs mt-1">
                Go to <button onClick={() => router.push("/settings")} className="text-accent hover:underline">Settings</button> to add channels
              </p>
            )}
          </div>
        ) : (
          activeConnections.map((conn) => {
            const isActive = pathname === `/chat/${conn.id}`;
            return (
              <button
                key={conn.id}
                onClick={() => router.push(`/chat/${conn.id}`)}
                className={`w-full text-left p-3 flex items-center gap-3 hover:bg-surface-hover transition-colors ${
                  isActive ? "bg-surface-hover border-l-2 border-accent" : "border-l-2 border-transparent"
                }`}
              >
                <div className={`platform-${conn.platform}`}>
                  {getPlatformIcon(conn.platform, "w-5 h-5")}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">
                    {conn.channel_name || `${conn.platform} channel`}
                  </span>
                  <span className="text-xs text-muted capitalize">{conn.platform}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* User info */}
      <div className="p-3 border-t border-border flex items-center gap-3">
        {profile?.avatar_url && (
          <img
            src={profile.avatar_url}
            alt=""
            className="w-7 h-7 rounded-full"
          />
        )}
        <span className="text-sm text-muted truncate flex-1">
          {profile?.display_name || "User"}
        </span>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-muted hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
