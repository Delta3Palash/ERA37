"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import type { CalendarEvent, CalendarKind } from "@/lib/types";
import { EventForm } from "./event-form";
import { formatInTimezone, formatTimeInTimezone, useUserTimezone } from "./use-user-timezone";
import { mondayOf } from "@/lib/calendar-upload";

interface Props {
  kind: CalendarKind;
  /** When true, the "Create" button + edit/delete controls are shown. */
  canWrite: boolean;
  currentUserId: string;
  isAdmin: boolean;
}

/**
 * Mon–Sun list view of `calendar_events` filtered to a single `kind`. Events
 * are rendered in the viewer's preferred timezone, sorted ascending, grouped
 * under a day heading for each day of the visible week. Navigation is week-
 * at-a-time (no month view — the alliance only cares about the current week
 * in practice).
 */
export function EventWeekView({ kind, canWrite, currentUserId, isAdmin }: Props) {
  const tz = useUserTimezone();
  const [weekStart, setWeekStart] = useState<Date>(() => toMondayUTC(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);

  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 7);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/calendar/events?kind=${kind}&from=${weekStart.toISOString()}&to=${weekEndExclusive.toISOString()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: CalendarEvent[] = await res.json();
        setEvents(data);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, weekStart.toISOString()]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this event?")) return;
    const res = await fetch(`/api/calendar/events/${id}`, { method: "DELETE" });
    if (res.ok) setEvents((prev) => prev.filter((e) => e.id !== id));
    else alert(`Delete failed: ${(await res.json()).error || res.status}`);
  }

  function canEdit(e: CalendarEvent): boolean {
    if (!canWrite) return false;
    if (isAdmin) return true;
    if (kind === "misc") return false; // only is_admin edits misc
    return e.created_by === currentUserId;
  }

  // Group events by date string (in viewer's tz) so that "same-day" events
  // appear together even if created in different zones.
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const dayKey = formatInTimezone(e.starts_at, tz, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey)!.push(e);
  }

  // Build 7-day skeleton so empty days still render, matching the screenshot
  // layout the user wants.
  const days: { key: string; label: string; date: Date }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    const key = formatInTimezone(d, tz, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const label = formatInTimezone(d, tz, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    days.push({ key, label, date: d });
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const d = new Date(weekStart);
              d.setUTCDate(d.getUTCDate() - 7);
              setWeekStart(d);
            }}
            className="p-1.5 rounded hover:bg-surface-hover text-muted"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWeekStart(toMondayUTC(new Date()))}
            className="px-2 py-1 rounded text-xs text-muted hover:bg-surface-hover"
          >
            This week
          </button>
          <button
            onClick={() => {
              const d = new Date(weekStart);
              d.setUTCDate(d.getUTCDate() + 7);
              setWeekStart(d);
            }}
            className="p-1.5 rounded hover:bg-surface-hover text-muted"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-3 text-xs text-muted">
            {mondayOf(weekStart)} · {tz}
          </span>
        </div>
        {canWrite && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-black text-xs font-medium hover:bg-accent-hover"
          >
            <Plus className="w-3.5 h-3.5" />
            {kind === "misc" ? "New task" : "New event"}
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-4">
        {loading && events.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">Loading…</div>
        ) : null}
        {days.map((d) => {
          const dayEvents = byDay.get(d.key) || [];
          return (
            <div key={d.key}>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                {d.label}
              </div>
              {dayEvents.length === 0 ? (
                <div className="text-xs text-muted/60 pl-0.5">—</div>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-surface border border-border"
                    >
                      <TypeBadge type={ev.event_type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{ev.title}</span>
                          {ev.assignee?.display_name && (
                            <span className="text-xs text-muted">
                              · {ev.assignee.display_name}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          {formatTimeInTimezone(ev.starts_at, tz)}
                          {ev.ends_at ? ` – ${formatTimeInTimezone(ev.ends_at, tz)}` : ""}
                        </div>
                        {ev.details && (
                          <div className="text-xs text-muted/80 mt-1 whitespace-pre-wrap">
                            {ev.details}
                          </div>
                        )}
                      </div>
                      {canEdit(ev) && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditing(ev)}
                            className="p-1 rounded hover:bg-surface-hover text-muted"
                            aria-label="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(ev.id)}
                            className="p-1 rounded hover:bg-surface-hover text-red-400"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {creating && (
        <EventForm
          kind={kind}
          initial={null}
          onCancel={() => setCreating(false)}
          onSave={(saved) => {
            setEvents((prev) => [...prev, saved].sort(sortByStart));
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <EventForm
          kind={kind}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(saved) => {
            setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: CalendarEvent["event_type"] }) {
  const colors: Record<CalendarEvent["event_type"], string> = {
    growth: "bg-green-500/20 text-green-300 border-green-500/30",
    attack: "bg-red-500/20 text-red-300 border-red-500/30",
    defense: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    rally: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${colors[type]}`}
    >
      {type}
    </span>
  );
}

// Monday (00:00) of the week containing `d`, computed in the browser's
// *local* timezone so a viewer whose "now" is Monday morning doesn't land
// on the previous UTC week.
function toMondayUTC(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function sortByStart(a: CalendarEvent, b: CalendarEvent) {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}
