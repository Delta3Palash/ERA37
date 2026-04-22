"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import type { CalendarEvent, CalendarEventType, CalendarKind } from "@/lib/types";
import { AssigneePicker } from "./assignee-picker";
import { utcPreview } from "./use-user-timezone";

interface Props {
  kind: CalendarKind;
  initial?: CalendarEvent | null;
  onSave: (saved: CalendarEvent) => void;
  onCancel: () => void;
  /** When true (and `initial` is set), a red trash button appears in the
   *  footer. Parent controls the policy — typically is_admin OR
   *  created_by === currentUserId. */
  canDelete?: boolean;
  /** Called after a successful DELETE so the parent can remove the row
   *  from its own state. Modal closes via onCancel. */
  onDelete?: (id: string) => void;
}

const TYPES: { value: CalendarEventType; label: string }[] = [
  { value: "growth", label: "Growth" },
  { value: "attack", label: "Attack" },
  { value: "defense", label: "Defense" },
  { value: "rally", label: "Rally" },
];

/**
 * Modal form for creating or editing a single calendar event. Works for both
 * alliance and misc kinds — the caller passes `kind` explicitly so the POST
 * routes through the same endpoint with different permissions.
 *
 * Times are typed as local datetime in the browser's timezone, then converted
 * to ISO UTC on submit. We intentionally don't make the user specify a
 * timezone in the form — the viewer's preferred zone handles display.
 */
export function EventForm({ kind, initial, onSave, onCancel, canDelete, onDelete }: Props) {
  const [eventType, setEventType] = useState<CalendarEventType>(
    initial?.event_type || "growth"
  );
  const [title, setTitle] = useState(initial?.title || "");
  const [details, setDetails] = useState(initial?.details || "");
  // <input type="datetime-local"> needs YYYY-MM-DDTHH:mm in local time.
  const [startsLocal, setStartsLocal] = useState<string>(
    initial ? toLocalInput(initial.starts_at) : ""
  );
  const [endsLocal, setEndsLocal] = useState<string>(
    initial?.ends_at ? toLocalInput(initial.ends_at) : ""
  );
  const [assignedTo, setAssignedTo] = useState<string | null>(initial?.assigned_to || null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startsLocal) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        kind,
        event_type: eventType,
        title: title.trim(),
        details: details.trim() || null,
        starts_at: new Date(startsLocal).toISOString(),
        ends_at: endsLocal ? new Date(endsLocal).toISOString() : null,
        assigned_to: assignedTo,
      };
      const url = initial
        ? `/api/calendar/events/${initial.id}`
        : "/api/calendar/events";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `Save failed (${res.status})`);
        return;
      }
      const saved: CalendarEvent = await res.json();
      onSave(saved);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial || !onDelete) return;
    const what = kind === "misc" ? "task" : "event";
    if (!confirm(`Delete this ${what}? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events/${initial.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `Delete failed (${res.status})`);
        return;
      }
      onDelete(initial.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-surface border border-border rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">
            {initial ? "Edit" : "New"} {kind === "misc" ? "task" : "event"}
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-hover text-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">Type</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as CalendarEventType)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Treasure Hunt"
              required
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">Details (optional)</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Coordinates, notes, etc."
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">
                Starts <span className="text-muted/60">(your local time)</span>
              </label>
              <input
                type="datetime-local"
                value={startsLocal}
                onChange={(e) => setStartsLocal(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              />
              <div className="text-[10px] text-muted/70 mt-1 font-mono min-h-[14px]">
                {utcPreview(startsLocal)}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">
                Ends <span className="text-muted/60">(optional)</span>
              </label>
              <input
                type="datetime-local"
                value={endsLocal}
                onChange={(e) => setEndsLocal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              />
              <div className="text-[10px] text-muted/70 mt-1 font-mono min-h-[14px]">
                {utcPreview(endsLocal)}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">R4 in charge</label>
            <AssigneePicker value={assignedTo} onChange={setAssignedTo} />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            {/* Delete button sits on the LEFT to visually separate destructive
                action from the primary Save on the right. Only rendered when
                editing an existing event AND the caller says the viewer can
                delete (typically is_admin, or creator of alliance/game). */}
            {initial && canDelete && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface-hover disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || deleting || !title.trim() || !startsLocal}
              className="px-4 py-2 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Saving…" : initial ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Convert an ISO UTC string to the value shape `<input type="datetime-local">` expects (local time, no tz suffix). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
