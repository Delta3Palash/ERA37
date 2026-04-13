"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { Send, Menu, Image } from "lucide-react";
import { GifPicker } from "./gif-picker";
import { isGifConfigured } from "@/lib/tenor";
import { TelegramIcon, DiscordIcon, SlackIcon, WhatsAppIcon } from "./platform-icons";
import { useSidebar } from "./chat-layout-wrapper";
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
  const [replyTo, setReplyTo] = useState<Connection | null>(null);
  const [sendAll, setSendAll] = useState(true);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const { toggle } = useSidebar();

  const connectionIds = useMemo(() => connections.map((c) => c.id).join(","), [connections]);

  // Realtime subscriptions
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
          (payload: any) => {
            const newMsg = payload.new as Message;
            // Skip bridged messages in unified view
            if (newMsg.direction === "bridged") return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg].sort(
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
  }, [connectionIds]);

  // Fallback polling + visibility refetch (handles silent WebSocket drops)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        loadMessages();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    // Poll every 10s as a safety net for dropped Realtime connections
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadMessages();
      }
    }, 10000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(poll);
    };
  }, [connectionIds]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    const connIds = connections.map((c) => c.id);
    if (connIds.length === 0) return;

    const { data } = await supabase
      .from("messages")
      .select("*")
      .in("connection_id", connIds)
      .neq("direction", "bridged")
      .order("created_at", { ascending: true });
    if (data) setMessages(data);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending || (!replyTo && !sendAll)) return;

    setSending(true);
    try {
      const body = sendAll
        ? { connectionIds: connections.map((c) => c.id), content: input.trim() }
        : { connectionId: replyTo!.id, content: input.trim() };

      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error("Send failed:", await res.json());
      } else {
        const data = await res.json();
        // Batch response returns { messages, failed }
        const newMessages = sendAll ? data.messages : [data];
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const unique = newMessages.filter((m: Message) => !ids.has(m.id));
          return [...prev, ...unique];
        });
      }
      setInput("");
    } finally {
      setSending(false);
    }
  }

  async function handleGifSelect(gifUrl: string) {
    setShowGifPicker(false);
    if (!replyTo && !sendAll) return;
    setSending(true);
    try {
      const body = sendAll
        ? { connectionIds: connections.map((c) => c.id), content: "", imageUrl: gifUrl }
        : { connectionId: replyTo!.id, content: "", imageUrl: gifUrl };
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const newMessages = sendAll ? data.messages : [data];
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const unique = newMessages.filter((m: Message) => !ids.has(m.id));
          return [...prev, ...unique];
        });
      }
    } finally {
      setSending(false);
    }
  }

  function getPlatformIcon(platform: Platform, size = "w-4 h-4") {
    switch (platform) {
      case "telegram": return <TelegramIcon className={size} />;
      case "discord": return <DiscordIcon className={size} />;
      case "slack": return <SlackIcon className={size} />;
      case "whatsapp": return <WhatsAppIcon className={size} />;
      default: return null;
    }
  }

  // Find which connection a message belongs to
  function getConnection(msg: Message): Connection | undefined {
    return connections.find((c) => c.id === msg.connection_id);
  }

  // Show incoming + outgoing, hide bridged duplicates and "Send to All" duplicates
  const visibleMessages = messages.filter((m) => m.direction !== "bridged").filter((msg, i, arr) => {
    // Deduplicate "Send to All" outgoing: keep only the first of each batch
    if (msg.direction !== "outgoing") return true;
    const prev = arr[i - 1];
    if (
      prev &&
      prev.direction === "outgoing" &&
      prev.content === msg.content &&
      prev.sent_by === msg.sent_by &&
      Math.abs(new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 2000
    ) {
      return false; // duplicate from batch send
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
        <button
          onClick={toggle}
          className="md:hidden p-1 rounded hover:bg-surface-hover text-muted"
        >
          <Menu className="w-5 h-5" />
        </button>
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
      <div className="flex-1 overflow-y-auto py-4">
        {visibleMessages.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">
            No messages yet across any platform.
          </div>
        ) : (
          visibleMessages.map((msg, i) => {
            const prev = visibleMessages[i - 1];
            const showHeader = !prev ||
              prev.sender_name !== msg.sender_name ||
              prev.direction !== msg.direction ||
              (msg.direction === "outgoing" && prev.sent_by !== msg.sent_by) ||
              new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;

            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                currentUserId={userId}
                preferredLanguage={preferredLanguage}
                showHeader={showHeader}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input with platform selector */}
      <div className="relative border-t border-border bg-surface">
        {showGifPicker && (
          <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
        )}
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 px-4 py-3"
        >
          {/* Platform selector — defaults to All, click to pick individual */}
          <div className="relative flex gap-1">
            <button
              type="button"
              onClick={() => {
                if (!sendAll) {
                  setSendAll(true);
                  setReplyTo(null);
                  setShowPlatformPicker(false);
                } else {
                  setShowPlatformPicker(!showPlatformPicker);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sendAll
                  ? "bg-accent/20 ring-1 ring-accent text-accent"
                  : "hover:bg-surface-hover text-muted"
              }`}
              title={sendAll ? "Click to pick a single platform" : "Send to all channels"}
            >
              All
            </button>
            {!sendAll && replyTo && (
              <button
                type="button"
                onClick={() => setShowPlatformPicker(!showPlatformPicker)}
                className={`p-1.5 rounded-lg bg-accent/20 ring-1 ring-accent platform-${replyTo.platform}`}
                title={`Sending to ${replyTo.channel_name} — click to change`}
              >
                {getPlatformIcon(replyTo.platform)}
              </button>
            )}
            {showPlatformPicker && (
              <div className="absolute bottom-full left-0 mb-2 flex gap-1 bg-surface border border-border rounded-lg p-1.5 shadow-lg z-50">
                {connections.map((conn) => (
                  <button
                    key={conn.id}
                    type="button"
                    onClick={() => { setReplyTo(conn); setSendAll(false); setShowPlatformPicker(false); }}
                    className={`p-1.5 rounded-lg transition-colors hover:bg-surface-hover platform-${conn.platform}`}
                    title={conn.channel_name || conn.platform}
                  >
                    {getPlatformIcon(conn.platform)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sendAll ? "Message all channels..." : replyTo ? `Message ${replyTo.channel_name}...` : "Select a platform..."}
            className="flex-1 px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent"
            disabled={sending || (!replyTo && !sendAll)}
          />
          {isGifConfigured() && (
            <button
              type="button"
              onClick={() => setShowGifPicker(!showGifPicker)}
              disabled={sending || (!replyTo && !sendAll)}
              className={`px-2 py-2 rounded-lg text-xs font-bold transition-colors ${
                showGifPicker
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-foreground hover:bg-surface-hover"
              } disabled:opacity-30`}
              title="Send a GIF"
            >
              GIF
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || sending || (!replyTo && !sendAll)}
            className="p-2.5 rounded-lg bg-accent text-black hover:bg-accent-hover transition-colors disabled:opacity-30"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
