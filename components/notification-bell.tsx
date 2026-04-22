"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarDays, CalendarX, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

interface Props {
  userId: string;
}

/**
 * Sidebar bell that shows the authenticated user's in-app notifications.
 * Lists the most recent 20 on open, unread first. Subscribes to Realtime
 * INSERT on notifications scoped to this user so fresh alerts appear
 * without polling or page refresh.
 *
 * Mark-read behaviour: clicking a notification marks that row read AND
 * navigates to its link_href (if present). "Mark all read" button clears
 * every unread in one request.
 */
export function NotificationBell({ userId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + Realtime subscription.
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload: { new: Notification }) => {
          setItems((prev) =>
            prev.some((n) => n.id === payload.new.id) ? prev : [payload.new, ...prev]
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, load]);

  // Close the dropdown when clicking outside of it.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function markAsRead(ids: string[]) {
    if (ids.length === 0) return;
    // Optimistic: stamp locally so the bell turns off immediately.
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n))
    );
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }

  function onRowClick(n: Notification) {
    if (!n.read_at) markAsRead([n.id]);
    if (n.link_href) router.push(n.link_href);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded hover:bg-surface-hover text-muted"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-black text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 max-h-[70vh] overflow-y-auto bg-surface border border-border rounded-lg shadow-xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="text-xs font-semibold text-muted">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : items.length === 0
                ? "No notifications"
                : "All caught up"}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] text-accent hover:underline inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          {loading && items.length === 0 ? (
            <div className="text-center text-muted text-xs py-8">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-center text-muted text-xs py-8">
              You&apos;ll see alerts here when you&apos;re assigned to events.
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => onRowClick(n)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-surface-hover transition-colors flex items-start gap-2 ${
                      !n.read_at ? "bg-accent/5" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 ${
                        n.kind === "event_assigned" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {n.kind === "event_assigned" ? (
                        <CalendarDays className="w-4 h-4" />
                      ) : (
                        <CalendarX className="w-4 h-4" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{n.title}</span>
                        {!n.read_at && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                        )}
                      </div>
                      {n.body && (
                        <div className="text-xs text-muted mt-0.5 truncate">{n.body}</div>
                      )}
                      <div className="text-[10px] text-muted/60 mt-0.5">
                        {relativeTime(n.created_at)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Small "2m ago" / "3h ago" formatter. Good enough without pulling date-fns. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(1, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
