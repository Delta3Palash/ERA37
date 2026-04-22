"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2 } from "lucide-react";
import type { GameCalendarImage } from "@/lib/types";
import { mondayOf, uploadCalendarScreenshot } from "@/lib/calendar-upload";

interface Props {
  /** True when the viewer is is_admin — enables upload + delete. */
  canManage: boolean;
}

/**
 * Shows the most recent 8 weeks of game-calendar screenshots, grouped by
 * `week_start`. Admins see a dropzone pinned above the current week for new
 * uploads, and a small delete button overlay on each image.
 *
 * Upload path: files go to Supabase Storage via `uploadCalendarScreenshot`,
 * then we POST the resulting public URL to `/api/calendar/game` which
 * inserts the discoverable row.
 */
export function GameWeekGrid({ canManage }: Props) {
  const [images, setImages] = useState<GameCalendarImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/game?weeks=8");
      if (res.ok) {
        const data: GameCalendarImage[] = await res.json();
        setImages(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFiles = useCallback(
    async (incoming: Iterable<File> | null | undefined) => {
      if (!incoming) return;
      const images = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      setUploading(true);
      setError(null);
      const week = mondayOf(new Date());
      try {
        for (const file of images) {
          const url = await uploadCalendarScreenshot(file, week);
          const res = await fetch("/api/calendar/game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ week_start: week, image_url: url }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Upload failed (${res.status})`);
          }
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [load]
  );

  // Paste-to-upload: while the game tab is open (and the viewer is an admin),
  // Ctrl/Cmd-V from any non-input focus uploads the clipboard image(s) to the
  // current week. Mirrors the paste flow already in components/conversation-view.
  useEffect(() => {
    if (!canManage) return;
    function onPaste(e: ClipboardEvent) {
      // If the user is in a text input / editor, let the paste target win.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      handleFiles(files);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [canManage, handleFiles]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this screenshot?")) return;
    const res = await fetch(`/api/calendar/game/${id}`, { method: "DELETE" });
    if (res.ok) {
      setImages((prev) => prev.filter((i) => i.id !== id));
    } else {
      alert(`Delete failed: ${(await res.json()).error || res.status}`);
    }
  }

  // Group images by week_start
  const byWeek = new Map<string, GameCalendarImage[]>();
  for (const img of images) {
    if (!byWeek.has(img.week_start)) byWeek.set(img.week_start, []);
    byWeek.get(img.week_start)!.push(img);
  }
  const weekKeys = Array.from(byWeek.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      {canManage && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
            dragging
              ? "border-accent bg-accent/5"
              : "border-border hover:border-accent/50 hover:bg-surface-hover"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-5 h-5 text-muted" />
          <div className="text-sm font-medium">
            {uploading ? "Uploading…" : "Drop, paste (Ctrl/Cmd + V), or click to upload"}
          </div>
          <div className="text-xs text-muted">
            Current week: {mondayOf(new Date())}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      {loading && images.length === 0 && (
        <div className="text-center text-muted text-sm py-8">Loading…</div>
      )}

      {!loading && weekKeys.length === 0 && (
        <div className="text-center text-muted text-sm py-8">
          No game calendar screenshots yet.
          {canManage && " Drop a screenshot above to start this week."}
        </div>
      )}

      {weekKeys.map((wk) => (
        <div key={wk}>
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Week of {wk}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {byWeek.get(wk)!.map((img) => (
              <div
                key={img.id}
                className="relative rounded-lg overflow-hidden border border-border bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.image_url}
                  alt={`Game calendar ${wk}`}
                  className="w-full h-auto block"
                />
                {canManage && (
                  <button
                    onClick={() => handleDelete(img.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors"
                    aria-label="Delete screenshot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
