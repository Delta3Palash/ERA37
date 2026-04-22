"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, List, BarChart3 } from "lucide-react";
import type { CalendarEvent, CalendarKind } from "@/lib/types";
import { EventForm } from "./event-form";
import { formatInTimezone, formatTimeInTimezone, useUserTimezone } from "./use-user-timezone";
import { mondayOf } from "@/lib/calendar-upload";

type ViewMode = "list" | "timeline";

interface Props {
  kind: CalendarKind;
  /** When true, the "Create" button + edit/delete controls are shown. */
  canWrite: boolean;
  currentUserId: string;
  isAdmin: boolean;
  /**
   * Optional node rendered below the day grid, inside the same scroll
   * container. Used on the Game tab to host the collapsible reference
   * screenshots without setting up a competing scroll area.
   */
  footer?: React.ReactNode;
}

/**
 * Mon–Sun list view of `calendar_events` filtered to a single `kind`. Events
 * are rendered in the viewer's preferred timezone, sorted ascending, grouped
 * under a day heading for each day of the visible week. Navigation is week-
 * at-a-time (no month view — the alliance only cares about the current week
 * in practice).
 */
export function EventWeekView({ kind, canWrite, currentUserId, isAdmin, footer }: Props) {
  const tz = useUserTimezone();
  const [weekStart, setWeekStart] = useState<Date>(() => toMondayUTC(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");

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
        <div className="flex items-center gap-2">
          {/* View-mode toggle: timeline (Gantt-style bars across the week)
              vs. list (grouped-by-day cards). Timeline is the default
              because it mirrors the game's own calendar UI. */}
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-background/50">
            <button
              onClick={() => setViewMode("timeline")}
              className={`px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                viewMode === "timeline"
                  ? "bg-accent text-black"
                  : "text-muted hover:text-foreground"
              }`}
              aria-label="Timeline view"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Timeline</span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                viewMode === "list"
                  ? "bg-accent text-black"
                  : "text-muted hover:text-foreground"
              }`}
              aria-label="List view"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
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
      </div>

      {viewMode === "timeline" && (
        <div className="px-4 py-3">
          {loading && events.length === 0 ? (
            <div className="text-center text-muted text-sm py-8">Loading…</div>
          ) : (
            <GanttWeek
              events={events}
              weekStart={weekStart}
              tz={tz}
              onEdit={canWrite ? (ev) => (canEdit(ev) ? setEditing(ev) : undefined) : undefined}
            />
          )}
        </div>
      )}

      {viewMode === "list" && (
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
                          {formatEventRange(ev.starts_at, ev.ends_at, tz)}
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
      )}

      {footer && <div className="px-4 pb-6">{footer}</div>}

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

/** True when two Date instances fall on the same calendar day in a given tz. */
function sameDayInTz(a: Date, b: Date, tz: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(a) === fmt.format(b);
}

/**
 * Human-readable range for the list view. If the event spans a single day
 * in the viewer's timezone, show "HH:mm – HH:mm". If it spans multiple
 * days, show "Mon Apr 20 04:00 → Wed Apr 23 03:59" so the span is obvious
 * (the previous "04:00 – 03:59" hid the fact that those times were on
 * different days).
 */
function formatEventRange(
  startsAt: string,
  endsAt: string | null,
  tz: string
): string {
  const s = new Date(startsAt);
  if (!endsAt) {
    return formatInTimezone(s, tz, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  const e = new Date(endsAt);
  if (sameDayInTz(s, e, tz)) {
    return `${formatTimeInTimezone(s, tz)} – ${formatTimeInTimezone(e, tz)}`;
  }
  const fmt: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  return `${formatInTimezone(s, tz, fmt)} → ${formatInTimezone(e, tz, fmt)}`;
}

// ============================================================================
// Gantt-style weekly timeline
// ============================================================================
// A 7-column grid (Mon–Sun) where each event renders as a horizontal bar
// spanning its day range, clipped to the visible week. Events that would
// overlap on the same row are greedy-packed into additional rows so nothing
// hides behind nothing else. Mirrors the game's own calendar UI (which the
// users are already familiar with) and lets multi-day events be grasped at
// a glance without reading a date range.

interface GanttProps {
  events: CalendarEvent[];
  weekStart: Date;
  tz: string;
  onEdit?: (ev: CalendarEvent) => void;
}

function GanttWeek({ events, weekStart, tz, onEdit }: GanttProps) {
  // Precompute the 7 day columns (used for both headers and the zero-index
  // "day diff" helper below).
  const days: { label: string; subLabel: string; date: Date }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push({
      label: formatInTimezone(d, tz, { weekday: "short" }).toUpperCase(),
      subLabel: formatInTimezone(d, tz, { month: "2-digit", day: "2-digit" }),
      date: d,
    });
  }

  // Return the 1-based column index for a given Date in the viewer's tz.
  // Clamps to [1, 7]; events outside the week are filtered out by the caller.
  function columnForDate(d: Date): number {
    const key = formatInTimezone(d, tz, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    for (let i = 0; i < 7; i++) {
      const dayKey = formatInTimezone(days[i].date, tz, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      if (dayKey === key) return i + 1;
    }
    return 0; // not in this week
  }

  type Positioned = { ev: CalendarEvent; startCol: number; span: number };
  const positioned: Positioned[] = [];
  for (const ev of events) {
    const s = new Date(ev.starts_at);
    const e = ev.ends_at ? new Date(ev.ends_at) : s;
    // Snap to the week bounds when the event spills out.
    const rawStart = columnForDate(s) || (s < days[0].date ? 1 : 8);
    const rawEnd = columnForDate(e) || (e > days[6].date ? 7 : 0);
    const startCol = Math.max(1, Math.min(7, rawStart));
    const endCol = Math.max(1, Math.min(7, rawEnd));
    if (rawStart > 7 || rawEnd < 1) continue; // event is outside this week
    positioned.push({ ev, startCol, span: endCol - startCol + 1 });
  }
  positioned.sort((a, b) => a.startCol - b.startCol);

  // Greedy row packing: place each event in the first row where its
  // [startCol, startCol+span) doesn't overlap an existing bar.
  const rows: Positioned[][] = [];
  for (const p of positioned) {
    let placed = false;
    for (const row of rows) {
      const last = row[row.length - 1];
      if (last.startCol + last.span <= p.startCol) {
        row.push(p);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([p]);
  }

  const barColor: Record<CalendarEvent["event_type"], string> = {
    growth: "bg-green-600/70 hover:bg-green-600 border-green-400/40 text-green-50",
    attack: "bg-red-600/70 hover:bg-red-600 border-red-400/40 text-red-50",
    defense: "bg-blue-600/70 hover:bg-blue-600 border-blue-400/40 text-blue-50",
    rally: "bg-amber-600/70 hover:bg-amber-600 border-amber-400/40 text-amber-50",
  };

  if (events.length === 0) {
    return (
      <div className="text-center text-muted text-sm py-8">
        Nothing scheduled this week.
      </div>
    );
  }

  return (
    <div className="min-w-[560px]">
      {/* Day header row */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {days.map((d) => (
          <div
            key={d.subLabel}
            className="rounded px-2 py-1 text-center bg-surface border border-border"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {d.label}
            </div>
            <div className="text-xs text-foreground/80 font-mono">{d.subLabel}</div>
          </div>
        ))}
      </div>

      {/* Event bar rows */}
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-7 gap-1">
            {row.map((p) => (
              <button
                key={p.ev.id}
                type="button"
                onClick={() => onEdit?.(p.ev)}
                style={{ gridColumn: `${p.startCol} / span ${p.span}` }}
                className={`text-left px-2 py-1.5 rounded border text-xs font-semibold truncate transition-colors ${barColor[p.ev.event_type]} ${onEdit ? "cursor-pointer" : "cursor-default"}`}
                title={`${p.ev.title}${p.ev.assignee?.display_name ? ` — ${p.ev.assignee.display_name}` : ""}\n${formatEventRange(p.ev.starts_at, p.ev.ends_at, tz)}`}
              >
                {p.ev.title}
                {p.ev.assignee?.display_name && (
                  <span className="ml-1 font-normal opacity-80">
                    · {p.ev.assignee.display_name}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
