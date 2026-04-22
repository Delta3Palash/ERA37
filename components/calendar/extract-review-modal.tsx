"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Sparkles } from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/lib/types";
import { AssigneePicker } from "./assignee-picker";
import { utcPreview } from "./use-user-timezone";

interface Draft {
  include: boolean;
  title: string;
  event_type: CalendarEventType;
  // datetime-local strings (local wall time)
  starts_local: string;
  ends_local: string;
  assigned_to: string | null;
}

interface Props {
  imageUrl: string;
  /** YYYY-MM-DD Monday of the week the screenshot covers. Anchors the year
   *  for Claude so it can't default to the wrong one (game screenshots have
   *  no year label on them). */
  weekStart: string;
  onCancel: () => void;
  onCreated: (events: CalendarEvent[]) => void;
}

const TYPES: CalendarEventType[] = ["growth", "attack", "defense", "rally"];

/**
 * Admin-only modal that sends a screenshot URL to /api/calendar/game/extract,
 * shows the parsed events as an editable checklist, and bulk-creates the
 * checked ones as kind=game events. Review-before-insert is on purpose —
 * vision models hallucinate dates and misread icons often enough that a
 * human confirmation step keeps the calendar clean.
 */
export function ExtractReviewModal({ imageUrl, weekStart, onCancel, onCreated }: Props) {
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/calendar/game/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imageUrl, week_start: weekStart }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) setError(err.error || `Extract failed (${res.status})`);
          return;
        }
        const data: {
          events: Array<{
            title: string;
            starts_at_day: string;
            ends_at_day: string;
            event_type: CalendarEventType;
          }>;
        } = await res.json();
        if (cancelled) return;

        // Turn day strings into datetime-local defaults: start at 00:00,
        // end at 23:59 of the last day. User can refine before creating.
        const mapped: Draft[] = data.events.map((e) => ({
          include: true,
          title: e.title,
          event_type: e.event_type,
          starts_local: `${e.starts_at_day}T00:00`,
          ends_local: `${e.ends_at_day}T23:59`,
          assigned_to: null,
        }));
        setDrafts(mapped);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Extract failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrl, weekStart]);

  function updateDraft(i: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  const includedCount = drafts.filter((d) => d.include).length;

  async function handleCreate() {
    if (includedCount === 0) return;
    setSaving(true);
    setError(null);
    const created: CalendarEvent[] = [];
    try {
      for (const d of drafts) {
        if (!d.include) continue;
        const body = {
          kind: "game" as const,
          event_type: d.event_type,
          title: d.title.trim(),
          details: null,
          starts_at: new Date(d.starts_local).toISOString(),
          ends_at: d.ends_local ? new Date(d.ends_local).toISOString() : null,
          assigned_to: d.assigned_to,
        };
        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Create failed for "${d.title}"`);
        }
        const saved: CalendarEvent = await res.json();
        created.push(saved);
      }
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-surface border border-border rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            Review extracted events
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-hover text-muted"
            disabled={saving}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Parsing screenshot…
            </div>
          )}

          {!loading && error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          {!loading && !error && drafts.length === 0 && (
            <div className="text-center text-muted text-sm py-8">
              No events detected. Try a clearer screenshot, or add events manually.
            </div>
          )}

          {!loading && drafts.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                {includedCount} of {drafts.length} selected. Uncheck rows you
                don&apos;t want to create. All fields are editable — the AI
                makes mistakes.
              </p>
              {drafts.map((d, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 space-y-2 ${
                    d.include
                      ? "border-border bg-background/40"
                      : "border-border/40 bg-background/20 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={d.include}
                      onChange={(e) => updateDraft(i, { include: e.target.checked })}
                      className="mt-1.5 accent-accent"
                    />
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-muted mb-0.5">Title</label>
                        <input
                          type="text"
                          value={d.title}
                          onChange={(e) => updateDraft(i, { title: e.target.value })}
                          disabled={!d.include}
                          className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted mb-0.5">Type</label>
                        <select
                          value={d.event_type}
                          onChange={(e) =>
                            updateDraft(i, {
                              event_type: e.target.value as CalendarEventType,
                            })
                          }
                          disabled={!d.include}
                          className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-sm capitalize"
                        >
                          {TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted mb-0.5">R4 in charge</label>
                        <AssigneePicker
                          value={d.assigned_to}
                          onChange={(id) => updateDraft(i, { assigned_to: id })}
                          disabled={!d.include}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted mb-0.5">
                          Starts <span className="text-muted/60">(local)</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={d.starts_local}
                          onChange={(e) => updateDraft(i, { starts_local: e.target.value })}
                          disabled={!d.include}
                          className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-sm"
                        />
                        <div className="text-[10px] text-muted/70 mt-0.5 font-mono min-h-[12px]">
                          {utcPreview(d.starts_local)}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted mb-0.5">
                          Ends <span className="text-muted/60">(local)</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={d.ends_local}
                          onChange={(e) => updateDraft(i, { ends_local: e.target.value })}
                          disabled={!d.include}
                          className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-sm"
                        />
                        <div className="text-[10px] text-muted/70 mt-0.5 font-mono min-h-[12px]">
                          {utcPreview(d.ends_local)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || loading || includedCount === 0}
            className="px-4 py-2 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {saving ? "Creating…" : `Create ${includedCount} event${includedCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
