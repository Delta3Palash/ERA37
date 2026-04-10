"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { Send, ArrowLeft } from "lucide-react";
import { TelegramIcon, DiscordIcon, SlackIcon } from "./platform-icons";
import { useRouter } from "next/navigation";
import type { Chat, Connection, Message, Platform } from "@/lib/types";

interface ConversationViewProps {
  chat: Chat & { connection: Connection };
  userId: string;
  preferredLanguage: string;
}

export function ConversationView({ chat, userId, preferredLanguage }: ConversationViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel(`messages-${chat.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chat.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chat.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: true })
      .limit(100);
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
          chatId: chat.id,
          connectionId: chat.connection_id,
          platformChatId: chat.platform_chat_id,
          platform: chat.platform,
          content: input.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Send failed:", err);
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
      default: return null;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
        <button
          onClick={() => router.push("/chat")}
          className="md:hidden p-1 rounded hover:bg-surface-hover text-muted"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className={`platform-${chat.platform}`}>
          {getPlatformIcon(chat.platform)}
        </div>
        <div>
          <h2 className="font-semibold text-sm">
            {chat.chat_name || "Unknown Chat"}
          </h2>
          <span className="text-xs text-muted capitalize">{chat.platform}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">
            No messages yet
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              preferredLanguage={preferredLanguage}
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
          placeholder="Type a message..."
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
