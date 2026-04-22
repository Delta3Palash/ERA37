"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { Send, Menu, X, ImageIcon, Reply } from "lucide-react";
import { uploadImage } from "@/lib/upload";
import { GifPicker } from "./gif-picker";
import { isGifConfigured } from "@/lib/tenor";
import { useSidebar } from "./chat-layout-wrapper";
import { TelegramIcon, DiscordIcon, SlackIcon, WhatsAppIcon } from "./platform-icons";
import { useRouter } from "next/navigation";
import type { Connection, Message, Platform, Role } from "@/lib/types";

const PAGE_SIZE = 200;

interface ConversationViewProps {
  connection: Connection;
  roleMap?: Record<string, Role[]>;
  userId: string;
  userName: string;
  preferredLanguage: string;
}

export function ConversationView({ connection, roleMap, userId, userName, preferredLanguage }: ConversationViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const pendingPrependRef = useRef<{ prevScrollHeight: number } | null>(null);
  const pendingInitialScrollRef = useRef(false);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { toggle } = useSidebar();

  // Mirror state into a ref so async callbacks (poll, infinite scroll) can
  // read the *current* messages without stale-closure bugs.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
    // Reset pagination state when the connection changes. The initial-scroll
    // flag guarantees the next useLayoutEffect snaps to the newest message
    // regardless of current scroll position (on fresh mount scrollTop === 0
    // and the distance-from-bottom heuristic wouldn't fire on its own).
    setMessages([]);
    setHasMoreOlder(true);
    pendingInitialScrollRef.current = true;
    loadInitial();

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

  // Fallback delta poll + visibility refetch (handles silent WebSocket drops).
  // Only fetches rows strictly newer than the newest we already have, so it
  // cannot wipe out a row Realtime just delivered (the flash-and-disappear
  // bug from replace-based polling).
  useEffect(() => {
    function tick() {
      if (document.visibilityState === "visible") loadNewer();
    }
    document.addEventListener("visibilitychange", tick);
    const poll = setInterval(tick, 10000);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      clearInterval(poll);
    };
  }, [connection.id]);

  // Scroll handling: auto-scroll to bottom only when the user is already
  // near the bottom (new incoming message), and preserve position when a
  // prepend from loadOlder lands.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (pendingInitialScrollRef.current && messages.length > 0) {
      // First paint after a connection switch or fresh mount — snap to the
      // bottom (no smooth: there's nothing to animate from) so the user
      // lands on the newest message.
      el.scrollTop = el.scrollHeight;
      pendingInitialScrollRef.current = false;
      return;
    }
    if (pendingPrependRef.current) {
      // Keep the user anchored on the row they were reading when the
      // older page was prepended.
      el.scrollTop = el.scrollHeight - pendingPrependRef.current.prevScrollHeight;
      pendingPrependRef.current = null;
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Infinite scroll: load older when the user scrolls near the top.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      if (el.scrollTop < 100 && hasMoreOlder && !loadingOlder) {
        loadOlder();
      }
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMoreOlder, loadingOlder]);

  async function loadInitial() {
    // Newest PAGE_SIZE first (descending) then reversed for display. Avoids
    // hitting PostgREST's default row cap (1000) and returning the oldest
    // slice — we want the user's eyeballs on the latest conversation.
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", connection.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (!data) return;
    if (data.length < PAGE_SIZE) setHasMoreOlder(false);
    const ordered = [...data].reverse();
    setMessages((prev) => {
      if (prev.length === 0) return ordered;
      // A Realtime event may have landed during the initial fetch —
      // merge by id so we don't drop it.
      const byId = new Map<string, Message>();
      for (const m of ordered) byId.set(m.id, m);
      for (const m of prev) if (!byId.has(m.id)) byId.set(m.id, m);
      return Array.from(byId.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }

  async function loadNewer() {
    const current = messagesRef.current;
    if (current.length === 0) return loadInitial();
    const newest = current[current.length - 1]?.created_at;
    if (!newest) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", connection.id)
      .gt("created_at", newest)
      .order("created_at", { ascending: true })
      .limit(PAGE_SIZE);
    if (!data || data.length === 0) return;
    setMessages((prev) => {
      const byId = new Map<string, Message>();
      for (const m of prev) byId.set(m.id, m);
      for (const m of data) if (!byId.has(m.id)) byId.set(m.id, m);
      return Array.from(byId.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }

  async function loadOlder() {
    const el = containerRef.current;
    const current = messagesRef.current;
    const oldest = current[0]?.created_at;
    if (!oldest || loadingOlder || !hasMoreOlder) return;
    setLoadingOlder(true);
    try {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("connection_id", connection.id)
        .lt("created_at", oldest)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (!data || data.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      if (data.length < PAGE_SIZE) setHasMoreOlder(false);
      const older = [...data].reverse();
      // Snapshot scroll height BEFORE React re-renders so useLayoutEffect
      // can restore the visual position after the prepend.
      if (el) pendingPrependRef.current = { prevScrollHeight: el.scrollHeight };
      setMessages((prev) => {
        const byId = new Map<string, Message>();
        for (const m of older) byId.set(m.id, m);
        for (const m of prev) if (!byId.has(m.id)) byId.set(m.id, m);
        return Array.from(byId.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
    } finally {
      setLoadingOlder(false);
    }
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
      {/* Header — sticky on mobile so the hamburger menu stays reachable even
          when the outer page scrolls (the flex-1 messages container handles
          its own overflow on desktop, so sticky is a no-op there). */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
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
      <div ref={containerRef} className="flex-1 overflow-y-auto py-4">
        {loadingOlder && (
          <div className="text-center text-muted text-xs py-2">Loading older messages…</div>
        )}
        {!hasMoreOlder && messages.length >= PAGE_SIZE && (
          <div className="text-center text-muted text-xs py-2">Beginning of conversation</div>
        )}
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
                  roleMap={roleMap}
                />
              );
            });
          })()
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input — sticky bottom so the send box stays reachable on mobile. */}
      <div
        className={`sticky bottom-0 z-20 border-t bg-surface transition-colors ${dragging ? "border-accent bg-accent/5" : "border-border"}`}
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
