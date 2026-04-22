"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { Send, Menu, Image, X, ImageIcon, Reply } from "lucide-react";
import { GifPicker } from "./gif-picker";
import { isGifConfigured } from "@/lib/tenor";
import { uploadImage } from "@/lib/upload";
import { TelegramIcon, DiscordIcon, SlackIcon, WhatsAppIcon } from "./platform-icons";
import { useSidebar } from "./chat-layout-wrapper";
import type { Connection, Message, Platform, Role } from "@/lib/types";

const PAGE_SIZE = 200;

interface UnifiedViewProps {
  connections: Connection[];
  roleMap?: Record<string, Role[]>;
  userId: string;
  userName: string;
  preferredLanguage: string;
}

export function UnifiedView({ connections, roleMap, userId, userName, preferredLanguage }: UnifiedViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Connection | null>(null);
  const [sendAll, setSendAll] = useState(true);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
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
  const { toggle } = useSidebar();

  const connectionIds = useMemo(() => connections.map((c) => c.id).join(","), [connections]);
  const connIdArray = useMemo(() => connectionIds ? connectionIds.split(",") : [], [connectionIds]);

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
    if (!pendingImage || (!replyTo && !sendAll)) return;
    setSending(true);
    try {
      const url = await uploadImage(pendingImage);
      const body = sendAll
        ? { connectionIds: connections.map((c) => c.id), content: input.trim() || "", imageUrl: url, replyToMessageId: replyingTo?.id || null }
        : { connectionId: replyTo!.id, content: input.trim() || "", imageUrl: url, replyToMessageId: replyingTo?.id || null };
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

  // Realtime subscriptions — one channel per connection. Bridged rows are
  // ignored so they don't double up the sender's own message in the unified
  // feed.
  useEffect(() => {
    setMessages([]);
    setHasMoreOlder(true);
    pendingInitialScrollRef.current = true;
    loadInitial();

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

  // Delta poll: only fetch rows strictly newer than what we already have,
  // so a poll running right after Realtime cannot replace-wipe the row.
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
  }, [connectionIds]);

  // Auto-scroll to bottom only when the user is already near it; preserve
  // scroll position when loadOlder prepends a page.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (pendingInitialScrollRef.current && messages.length > 0) {
      // Fresh mount / connection change — snap to the newest message.
      el.scrollTop = el.scrollHeight;
      pendingInitialScrollRef.current = false;
      return;
    }
    if (pendingPrependRef.current) {
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
    if (connIdArray.length === 0) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .in("connection_id", connIdArray)
      .neq("direction", "bridged")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (!data) return;
    if (data.length < PAGE_SIZE) setHasMoreOlder(false);
    const ordered = [...data].reverse();
    setMessages((prev) => {
      if (prev.length === 0) return ordered;
      const byId = new Map<string, Message>();
      for (const m of ordered) byId.set(m.id, m);
      for (const m of prev) if (!byId.has(m.id)) byId.set(m.id, m);
      return Array.from(byId.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }

  async function loadNewer() {
    if (connIdArray.length === 0) return;
    const current = messagesRef.current;
    if (current.length === 0) return loadInitial();
    const newest = current[current.length - 1]?.created_at;
    if (!newest) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .in("connection_id", connIdArray)
      .neq("direction", "bridged")
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
    if (connIdArray.length === 0) return;
    const el = containerRef.current;
    const current = messagesRef.current;
    const oldest = current[0]?.created_at;
    if (!oldest || loadingOlder || !hasMoreOlder) return;
    setLoadingOlder(true);
    try {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .in("connection_id", connIdArray)
        .neq("direction", "bridged")
        .lt("created_at", oldest)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (!data || data.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      if (data.length < PAGE_SIZE) setHasMoreOlder(false);
      const older = [...data].reverse();
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
    if (!input.trim() || sending || (!replyTo && !sendAll)) return;

    setSending(true);
    try {
      const body = sendAll
        ? { connectionIds: connections.map((c) => c.id), content: input.trim(), replyToMessageId: replyingTo?.id || null }
        : { connectionId: replyTo!.id, content: input.trim(), replyToMessageId: replyingTo?.id || null };

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
      setReplyingTo(null);
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
      {/* Header — sticky on mobile so the hamburger menu stays reachable. */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
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
      <div ref={containerRef} className="flex-1 overflow-y-auto py-4">
        {loadingOlder && (
          <div className="text-center text-muted text-xs py-2">Loading older messages…</div>
        )}
        {!hasMoreOlder && messages.length >= PAGE_SIZE && (
          <div className="text-center text-muted text-xs py-2">Beginning of history</div>
        )}
        {visibleMessages.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">
            No messages yet across any platform.
          </div>
        ) : (
          (() => {
            const messageMap = new Map(visibleMessages.map((m) => [m.id, m]));
            return visibleMessages.map((msg, i) => {
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

      {/* Input with platform selector */}
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
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={replyingTo ? `Reply to ${replyingTo.sender_name}...` : pendingImage ? "Add a comment..." : sendAll ? "Message all channels..." : replyTo ? `Message ${replyTo.channel_name}...` : "Select a platform..."}
            className="flex-1 px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent"
            disabled={sending || (!replyTo && !sendAll)}
          />
          {isGifConfigured() && !pendingImage && (
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
            disabled={(!input.trim() && !pendingImage) || sending || (!replyTo && !sendAll)}
            className="p-2.5 rounded-lg bg-accent text-black hover:bg-accent-hover transition-colors disabled:opacity-30"
          >
            {pendingImage ? <ImageIcon className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
