"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare,
  Settings,
  LogOut,
  Hash,
  Globe,
  ChevronDown,
  ChevronRight,
  Lock,
  Shield,
  Calendar,
} from "lucide-react";
import { TelegramIcon, DiscordIcon, SlackIcon, WhatsAppIcon } from "./platform-icons";
import { useSidebar } from "./chat-layout-wrapper";
import type { ChannelGroup, Connection, Profile, Platform } from "@/lib/types";

interface ChatSidebarProps {
  userId: string;
  profile: Profile | null;
  groups: (ChannelGroup & { connections: Connection[] })[];
  isAdmin: boolean;
  /**
   * True for superadmins AND for users holding a role with can_manage=true.
   * Controls visibility of the admin shield icon + the Settings gear.
   */
  canOpenAdmin: boolean;
}

export function ChatSidebar({ userId, profile, groups, isAdmin, canOpenAdmin }: ChatSidebarProps) {
  const [openGroupIds, setOpenGroupIds] = useState<Record<string, boolean>>(() => {
    // Open all groups by default so users see their options
    const map: Record<string, boolean> = {};
    for (const g of groups) map[g.id] = true;
    return map;
  });
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const { open, close } = useSidebar();

  // Keep sidebar in sync when connections/groups change (via realtime) —
  // just refresh the server layout so the new `groups` prop flows down.
  useEffect(() => {
    const channel = supabase
      .channel("sidebar-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, () =>
        router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_groups" },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_group_connections" },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, supabase]);

  const accessibleConnections = useMemo(
    () =>
      Array.from(
        new Map(groups.flatMap((g) => g.connections).map((c) => [c.id, c])).values()
      ),
    [groups]
  );

  function getPlatformIcon(platform: Platform, size = "w-5 h-5") {
    switch (platform) {
      case "telegram":
        return <TelegramIcon className={size} />;
      case "discord":
        return <DiscordIcon className={size} />;
      case "slack":
        return <SlackIcon className={size} />;
      case "whatsapp":
        return <WhatsAppIcon className={size} />;
      default:
        return <Hash className={size} />;
    }
  }

  function navigate(path: string) {
    router.push(path);
    close();
  }

  function toggleGroup(id: string) {
    setOpenGroupIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={close} />
      )}

      <aside
        className={`
        ${open ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0
        fixed md:static inset-y-0 left-0 z-50
        w-72 flex flex-col bg-surface border-r border-border h-full
        transition-transform duration-200 ease-in-out
      `}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="text-lg font-bold">
            ERA<span className="text-accent">37</span>
          </h1>
          {(canOpenAdmin || isAdmin) && (
            <div className="flex items-center gap-1">
              {canOpenAdmin && (
                <button
                  onClick={() => navigate("/admin/roles")}
                  className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-muted hover:text-foreground"
                  title="Admin"
                >
                  <Shield className="w-4 h-4" />
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => navigate("/settings")}
                  className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-muted hover:text-foreground"
                  title="Channel settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto">
          {accessibleConnections.length > 0 && (
            <button
              onClick={() => navigate("/chat/all")}
              className={`w-full text-left p-3 flex items-center gap-3 hover:bg-surface-hover transition-colors ${
                pathname === "/chat/all"
                  ? "bg-surface-hover border-l-2 border-accent"
                  : "border-l-2 border-transparent"
              }`}
            >
              <MessageSquare className="w-5 h-5 text-accent" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold truncate block">All Messages</span>
                <span className="text-xs text-muted">Unified timeline</span>
              </div>
            </button>
          )}

          <button
            onClick={() => navigate("/calendar/game")}
            className={`w-full text-left p-3 flex items-center gap-3 hover:bg-surface-hover transition-colors ${
              pathname.startsWith("/calendar")
                ? "bg-surface-hover border-l-2 border-accent"
                : "border-l-2 border-transparent"
            }`}
          >
            <Calendar className="w-5 h-5 text-accent" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold truncate block">Calendar</span>
              <span className="text-xs text-muted">Game + alliance events</span>
            </div>
          </button>

          {groups.length === 0 ? (
            <div className="p-4 text-center text-muted text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No channels available</p>
              {isAdmin && (
                <p className="text-xs mt-1">
                  Go to{" "}
                  <button
                    onClick={() => navigate("/admin/groups")}
                    className="text-accent hover:underline"
                  >
                    Admin
                  </button>{" "}
                  to set up groups
                </p>
              )}
            </div>
          ) : (
            groups.map((group) => {
              const isOpen = openGroupIds[group.id] ?? true;
              return (
                <div key={group.id}>
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full text-left px-3 pt-3 pb-1 flex items-center gap-1 group"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3 h-3 text-muted" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted" />
                    )}
                    <span className="text-xs font-medium text-muted uppercase tracking-wider group-hover:text-foreground transition-colors flex items-center gap-1 flex-1 min-w-0">
                      <span className="truncate">{group.name}</span>
                      {group.min_role_priority > 0 && (
                        <Lock className="w-2.5 h-2.5 flex-shrink-0" />
                      )}
                      <span className="text-muted/60">({group.connections.length})</span>
                    </span>
                  </button>

                  {isOpen &&
                    group.connections.map((conn) => {
                      const isActive = pathname === `/chat/${conn.id}`;
                      return (
                        <button
                          key={`${group.id}-${conn.id}`}
                          onClick={() => navigate(`/chat/${conn.id}`)}
                          className={`w-full text-left p-3 pl-6 flex items-center gap-3 hover:bg-surface-hover transition-colors ${
                            isActive
                              ? "bg-surface-hover border-l-2 border-accent"
                              : "border-l-2 border-transparent"
                          }`}
                        >
                          <div className={`platform-${conn.platform}`}>
                            {getPlatformIcon(conn.platform, "w-4 h-4")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate block">
                              {conn.channel_name || `${conn.platform} channel`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              );
            })
          )}
        </div>

        {/* User info */}
        <div className="p-3 border-t border-border flex items-center gap-3">
          {profile?.avatar_url && (
            <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full" />
          )}
          <span className="text-sm text-muted truncate flex-1">
            {profile?.display_name || "User"}
          </span>
          <button
            onClick={() => navigate("/preferences")}
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-muted hover:text-foreground"
            title="Preferences"
          >
            <Globe className="w-4 h-4" />
          </button>
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
    </>
  );
}
