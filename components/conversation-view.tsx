"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { Send, Menu } from "lucide-react";
import { useSidebar } from "./chat-layout-wrapper";
import { TelegramIcon, DiscordIcon, SlackIcon, WhatsAppIcon } from "./platform-icons";
import { useRouter } from "next/navigation";
import type { Connection, Message, Platform } from "@/lib/types";

interface ConversationViewProps {
  connection: Connection;
  userId: string;
  userName: string;
  preferredLanguage: string;
  autoTranslate: boolean;
}

export function ConversationView({ connection, userId, userName, preferredLanguage, autoTranslate }: ConversationViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();
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

    const channel = supabase
      .channel(`messages-${connection.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `connection_id=eq.${connection.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          if (autoTranslate && newMsg.direction === "incoming" && !newMsg.translated_content && newMsg.content) {
            autoTranslateMessage(newMsg);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [connection.id, autoTranslate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", connection.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data) setMessages(data);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: connection.id,
          content: input.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Send failed:", err);
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

  function getPlatformIcon(platform: Platform) {
    switch (platform) {
      case "telegram": return <TelegramIcon className="w-5 h-5" />;
      case "discord": return <DiscordIcon className="w-5 h-5" />;
      case "slack": return <SlackIcon className="w-5 h-5" />;
      case "whatsapp": return <WhatsAppIcon className="w-5 h-5" />;
      default: return null;
    }
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
        <div className={`platform-${connection.platform}`}>
          {getPlatformIcon(connection.platform)}
        </div>
        <div>
          <h2 className="font-semibold text-sm">
            {connection.channel_name || `${connection.platform} channel`}
          </h2>
          <span className="text-xs text-muted capitalize">{connection.platform}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">
            No messages yet. Messages from {connection.platform} will appear here.
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              currentUserId={userId}
              preferredLanguage={preferredLanguage}
              autoTranslate={autoTranslate}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 px-4 py-3 border-t border-border bg-surface"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message #${connection.channel_name || connection.platform}...`}
          className="flex-1 px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="p-2.5 rounded-lg bg-accent text-black hover:bg-accent-hover transition-colors disabled:opacity-30"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
