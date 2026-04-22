"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { AvailabilityGrid, R4Availability, Weekday } from "@/lib/types";
import { WEEKDAYS } from "@/lib/types";

interface Props {
  target: R4Availability;
  onCancel: () => void;
  onSaved: (grid: AvailabilityGrid) => void;
}

/**
 * 7×24 checkbox grid. Rows are weekdays (Mon…Sun), columns are UTC hours
 * 00..23. Clicking a cell toggles availability for that (day, hour). Row
 * headers toggle the whole row; column headers toggle the whole column;
 * clicking inside the grid supports click-and-drag paint for fast entry.
 */
export function AvailabilityEditor({ target, onCancel, onSaved }: Props) {
  const [grid, setGrid] = useState<AvailabilityGrid>(() => {
    // Deep-copy to avoid mutating the parent-provided object.
    const out: AvailabilityGrid = {};
    for (const d of WEEKDAYS) {
      out[d] = [...(target.availability_utc?.[d] || [])];
    }
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paint-drag state: when the user mouses-down on a cell, we record whether
  // that cell is currently on or off. Subsequent cells entered while the
  // button is held flip TO the OPPOSITE state. This matches how Google
  // Calendar's "select time range" feels.
  const [painting, setPainting] = useState<{ toOn: boolean } | null>(null);

  function isOn(day: Weekday, hour: number): boolean {
    return (grid[day] || []).includes(hour);
  }

  function setCell(day: Weekday, hour: number, on: boolean) {
    setGrid((prev) => {
      const current = new Set(prev[day] || []);
      if (on) current.add(hour);
      else current.delete(hour);
      return { ...prev, [day]: Array.from(current).sort((a, b) => a - b) };
    });
  }

  function toggleRow(day: Weekday) {
    setGrid((prev) => {
      const full = (prev[day] || []).length === 24;
      return {
        ...prev,
        [day]: full ? [] : Array.from({ length: 24 }, (_, i) => i),
      };
    });
  }

  function toggleColumn(hour: number) {
    const everyOn = WEEKDAYS.every((d) => (grid[d] || []).includes(hour));
    setGrid((prev) => {
      const next = { ...prev };
      for (const d of WEEKDAYS) {
        const current = new Set(next[d] || []);
        if (everyOn) current.delete(hour);
        else current.add(hour);
        next[d] = Array.from(current).sort((a, b) => a - b);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/team-clock/availability/${target.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability_utc: grid }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `Save failed (${res.status})`);
        return;
      }
      const data = await res.json();
      onSaved(data.availability_utc as AvailabilityGrid);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-surface border border-border rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">
            Availability — {target.display_name || "(no name)"}
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-hover text-muted"
            disabled={saving}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <p className="text-xs text-muted mb-3">
            Click cells to toggle, drag to paint. Hours are UTC. Row header
            toggles the whole day; column header toggles that hour across all
            days.
          </p>

          <div
            className="inline-block select-none"
            onMouseUp={() => setPainting(null)}
            onMouseLeave={() => setPainting(null)}
          >
            {/* Column headers */}
            <div
              className="grid"
              style={{ gridTemplateColumns: "48px repeat(24, 22px)" }}
            >
              <div />
              {Array.from({ length: 24 }).map((_, h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => toggleColumn(h)}
                  className="text-[10px] text-muted font-mono hover:text-foreground text-center"
                  title={`Toggle ${String(h).padStart(2, "0")}:00 UTC across all days`}
                >
                  {String(h).padStart(2, "0")}
                </button>
              ))}
            </div>

            {/* Day rows */}
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="grid"
                style={{ gridTemplateColumns: "48px repeat(24, 22px)" }}
              >
                <button
                  type="button"
                  onClick={() => toggleRow(day)}
                  className="text-[10px] uppercase font-semibold text-muted hover:text-foreground text-right pr-2 h-6 flex items-center justify-end"
                  title={`Toggle all 24 hours on ${day}`}
                >
                  {day}
                </button>
                {Array.from({ length: 24 }).map((_, h) => {
                  const on = isOn(day, h);
                  return (
                    <div
                      key={h}
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${day} ${String(h).padStart(2, "0")}:00`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const nextOn = !on;
                        setCell(day, h, nextOn);
                        setPainting({ toOn: nextOn });
                      }}
                      onMouseEnter={() => {
                        if (painting) setCell(day, h, painting.toOn);
                      }}
                      className={`h-6 border border-border/40 cursor-pointer transition-colors ${
                        on ? "bg-accent" : "bg-background hover:bg-surface-hover"
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
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
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
