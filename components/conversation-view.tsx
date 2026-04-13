"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { Send, Menu, X, ImageIcon, Reply } from "lucide-react";
import { uploadImage } from "@/lib/upload";
import { GifPicker } from "./gif-picker";
import { isGifConfigured } from "@/lib/tenor";
import { useSidebar } from "./chat-layout-wrapper";
import { TelegramIcon, DiscordIcon, SlackIcon, WhatsAppIcon } from "./platform-icons";
import { useRouter } from "next/navigation";
import type { Connection, Message, Platform } from "@/lib/types";

interface ConversationViewProps {
  connection: Connection;
  userId: string;
  userName: string;
  preferredLanguage: string;
}

export function ConversationView({ connection, userId, userName, preferredLanguage }: ConversationViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { toggle } = useSidebar();

  function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setPendingImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearPendingImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setPendingImage(null);
    setImagePreview(null);
  }

  async function sendPendingImage() {
    if (!pendingImage) return;
    setSending(true);
    try {
      const url = await uploadImage(pendingImage);
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: connection.id,
          content: input.trim() || "",
          imageUrl: url,
          replyToMessageId: replyingTo?.id || null,
        }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      }
      setInput("");
      setReplyingTo(null);
      clearPendingImage();
    } finally {
      setSending(false);
    }
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageFile(file);
        return;
      }
    }
  }, []);

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
        (payload: any) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [connection.id]);

  // Fallback polling + visibility refetch (handles silent WebSocket drops)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        loadMessages();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadMessages();
      }
    }, 10000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(poll);
    };
  }, [connection.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", connection.id)
      .order("created_at", { ascending: true });
    if (data) setMessages((prev) => {
      if (prev.length === data.length && prev[prev.length - 1]?.id === data[data.length - 1]?.id) return prev;
      return data;
    });
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
          replyToMessageId: replyingTo?.id || null,
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
      setReplyingTo(null);
    } finally {
      setSending(false);
    }
  }

  async function handleGifSelect(gifUrl: string) {
    setShowGifPicker(false);
    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: connection.id,
          content: "",
          imageUrl: gifUrl,
        }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      }
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
      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">
            No messages yet. Messages from {connection.platform} will appear here.
          </div>
        ) : (
          (() => {
            const messageMap = new Map(messages.map((m) => [m.id, m]));
            return messages.map((msg, i) => {
              const prev = messages[i - 1];
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
                  showHeader={showHeader || !!msg.reply_to_message_id}
                  replyToMessage={msg.reply_to_message_id ? messageMap.get(msg.reply_to_message_id) : null}
                  onReply={(m) => { setReplyingTo(m); inputRef.current?.focus(); }}
                />
              );
            });
          })()
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className={`relative border-t bg-surface transition-colors ${dragging ? "border-accent bg-accent/5" : "border-border"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleImageFile(file);
        }}
      >
        {dragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-accent/10 border-2 border-dashed border-accent rounded-lg z-10 pointer-events-none">
            <p className="text-accent font-medium text-sm">Drop image here</p>
          </div>
        )}
        {replyingTo && (
          <div className="flex items-center gap-2 px-4 pt-3 text-xs text-muted">
            <Reply className="w-3 h-3 flex-shrink-0 scale-x-[-1] text-accent" />
            <span className="truncate">
              Replying to <span className="font-semibold text-foreground/80">{replyingTo.sender_name}</span>
              {replyingTo.content && <span className="ml-1 text-muted">— {replyingTo.content.slice(0, 80)}{replyingTo.content.length > 80 ? "..." : ""}</span>}
            </span>
            <button onClick={() => setReplyingTo(null)} className="ml-auto p-0.5 hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {showGifPicker && (
          <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
        )}
        {imagePreview && (
          <div className="px-4 pt-3 flex items-end gap-2">
            <div className="relative">
              <img src={imagePreview} alt="Preview" className="max-h-32 rounded-lg border border-border" />
              <button
                onClick={clearPendingImage}
                className="absolute -top-2 -right-2 p-0.5 rounded-full bg-red-500 text-white hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
        <form
          onSubmit={pendingImage ? (e) => { e.preventDefault(); sendPendingImage(); } : handleSend}
          className="flex items-center gap-2 px-4 py-3"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={replyingTo ? `Reply to ${replyingTo.sender_name}...` : pendingImage ? "Add a comment..." : `Message #${connection.channel_name || connection.platform}...`}
            className="flex-1 px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent"
            disabled={sending}
          />
          {isGifConfigured() && !pendingImage && (
            <button
              type="button"
              onClick={() => setShowGifPicker(!showGifPicker)}
              disabled={sending}
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
            disabled={(!input.trim() && !pendingImage) || sending}
            className="p-2.5 rounded-lg bg-accent text-black hover:bg-accent-hover transition-colors disabled:opacity-30"
          >
            {pendingImage ? <ImageIcon className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
