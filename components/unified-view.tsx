"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { Send, Menu } from "lucide-react";
import { TelegramIcon, DiscordIcon, SlackIcon, WhatsAppIcon } from "./platform-icons";
import { useSidebar } from "./chat-layout-wrapper";
import type { Connection, Message, Platform } from "@/lib/types";

interface UnifiedViewProps {
  connections: Connection[];
  userId: string;
  userName: string;
  preferredLanguage: string;
  autoTranslate: boolean;
}

export function UnifiedView({ connections, userId, userName, preferredLanguage, autoTranslate }: UnifiedViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Connection | null>(connections[0] || null);
  const [sendAll, setSendAll] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { toggle } = useSidebar();

  async function autoTranslateMessage(msg: Message) {
    if (!msg.content) return;
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: msg.id,
          text: msg.content,
          targetLanguage: preferredLanguage,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, translated_content: data.translatedText, translated_language: preferredLanguage }
              : m
          )
        );
      }
    } catch (err) {
      console.error("Auto-translate error:", err);
    }
  }

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
            const newMsg = payload.new as Message;
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            });

            // Auto-translate incoming messages if enabled
            if (autoTranslate && newMsg.direction === "incoming" && !newMsg.translated_content && newMsg.content) {
              autoTranslateMessage(newMsg);
            }
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [connections.length, autoTranslate]);

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

  // Group broadcast messages (same content, same sender, within 2s)
  function groupMessages(msgs: Message[]): { msg: Message; platforms: Platform[] }[] {
    const grouped: { msg: Message; platforms: Platform[] }[] = [];
    for (const msg of msgs) {
      const prev = grouped[grouped.length - 1];
      if (
        prev &&
        prev.msg.content === msg.content &&
        prev.msg.sent_by === msg.sent_by &&
        prev.msg.direction === "outgoing" &&
        msg.direction === "outgoing" &&
        Math.abs(new Date(msg.created_at).getTime() - new Date(prev.msg.created_at).getTime()) < 2000
      ) {
        prev.platforms.push(msg.platform as Platform);
      } else {
        grouped.push({ msg, platforms: [msg.platform as Platform] });
      }
    }
    return grouped;
  }

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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">
            No messages yet across any platform.
          </div>
        ) : (
          groupMessages(messages).map(({ msg, platforms }) => (
            <div key={msg.id} className="relative">
              {/* Platform badge(s) */}
              <div className="absolute -left-1 top-0 flex flex-col gap-0.5">
                {platforms.map((p, i) => (
                  <div key={i} className={`platform-${p} opacity-60`}>
                    {getPlatformIcon(p, "w-3 h-3")}
                  </div>
                ))}
              </div>
              <div className="pl-4">
                <MessageBubble
                  message={msg}
                  currentUserId={userId}
                  preferredLanguage={preferredLanguage}
                  autoTranslate={autoTranslate}
                />
              </div>
            </div>
          ))
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
          {connections.length > 1 && (
            <button
              type="button"
              onClick={() => { setSendAll(true); setReplyTo(null); }}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sendAll
                  ? "bg-accent/20 ring-1 ring-accent text-accent"
                  : "hover:bg-surface-hover opacity-50 text-muted"
              }`}
              title="Send to all channels"
            >
              All
            </button>
          )}
          {connections.map((conn) => (
            <button
              key={conn.id}
              type="button"
              onClick={() => { setReplyTo(conn); setSendAll(false); }}
              className={`p-1.5 rounded-lg transition-colors ${
                sendAll || replyTo?.id === conn.id
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
          placeholder={sendAll ? "Message all channels..." : replyTo ? `Message ${replyTo.channel_name}...` : "Select a platform..."}
          className="flex-1 px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent"
          disabled={sending || (!replyTo && !sendAll)}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending || (!replyTo && !sendAll)}
          className="p-2.5 rounded-lg bg-accent text-black hover:bg-accent-hover transition-colors disabled:opacity-30"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
