"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { Send } from "lucide-react";
import { TelegramIcon, DiscordIcon, SlackIcon } from "./platform-icons";
import type { Connection, Message, Platform } from "@/lib/types";

interface UnifiedViewProps {
  connections: Connection[];
  userId: string;
  userName: string;
  preferredLanguage: string;
}

export function UnifiedView({ connections, userId, userName, preferredLanguage }: UnifiedViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Connection | null>(connections[0] || null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    loadMessages();

    // Subscribe to all connections
    const channels = connections.map((conn) =>
      supabase
        .channel(`unified-${conn.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `connection_id=eq.${conn.id}`,
          },
          (payload) => {
            setMessages((prev) => {
              if (prev.some((m) => m.id === (payload.new as Message).id)) return prev;
              return [...prev, payload.new as Message].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            });
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [connections.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    const connectionIds = connections.map((c) => c.id);
    if (connectionIds.length === 0) return;

    const { data } = await supabase
      .from("messages")
      .select("*")
      .in("connection_id", connectionIds)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data) setMessages(data);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending || !replyTo) return;

    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: replyTo.id,
          content: input.trim(),
        }),
      });

      if (!res.ok) {
        console.error("Send failed:", await res.json());
      } else {
        const msg = await res.json();
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      setInput("");
    } finally {
      setSending(false);
    }
  }

  function getPlatformIcon(platform: Platform, size = "w-4 h-4") {
    switch (platform) {
      case "telegram": return <TelegramIcon className={size} />;
      case "discord": return <DiscordIcon className={size} />;
      case "slack": return <SlackIcon className={size} />;
      default: return null;
    }
  }

  // Find which connection a message belongs to
  function getConnection(msg: Message): Connection | undefined {
    return connections.find((c) => c.id === msg.connection_id);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
        <div className="flex -space-x-1">
          {connections.map((c) => (
            <div key={c.id} className={`platform-${c.platform}`}>
              {getPlatformIcon(c.platform, "w-5 h-5")}
            </div>
          ))}
        </div>
        <div>
          <h2 className="font-semibold text-sm">All Messages</h2>
          <span className="text-xs text-muted">
            {connections.map((c) => c.channel_name).join(" + ")}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">
            No messages yet across any platform.
          </div>
        ) : (
          messages.map((msg) => {
            const conn = getConnection(msg);
            return (
              <div key={msg.id} className="relative">
                {/* Platform badge */}
                <div className="absolute -left-1 top-0">
                  <div className={`platform-${msg.platform} opacity-60`}>
                    {getPlatformIcon(msg.platform, "w-3 h-3")}
                  </div>
                </div>
                <div className="pl-4">
                  <MessageBubble
                    message={msg}
                    currentUserId={userId}
                    preferredLanguage={preferredLanguage}
                  />
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input with platform selector */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 px-4 py-3 border-t border-border bg-surface"
      >
        {/* Platform selector */}
        <div className="flex gap-1">
          {connections.map((conn) => (
            <button
              key={conn.id}
              type="button"
              onClick={() => setReplyTo(conn)}
              className={`p-1.5 rounded-lg transition-colors ${
                replyTo?.id === conn.id
                  ? "bg-accent/20 ring-1 ring-accent"
                  : "hover:bg-surface-hover opacity-50"
              } platform-${conn.platform}`}
              title={`Send to ${conn.channel_name}`}
            >
              {getPlatformIcon(conn.platform)}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={replyTo ? `Message ${replyTo.channel_name}...` : "Select a platform..."}
          className="flex-1 px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent"
          disabled={sending || !replyTo}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending || !replyTo}
          className="p-2.5 rounded-lg bg-accent text-black hover:bg-accent-hover transition-colors disabled:opacity-30"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
