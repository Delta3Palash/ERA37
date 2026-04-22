"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type {
  AvailabilityGrid,
  R4Availability,
  TeamClockTimezone,
  Weekday,
} from "@/lib/types";
import { WEEKDAYS } from "@/lib/types";
import { RadialClock, PERIOD_LABELS, PERIOD_FILL } from "./radial-clock";
import { AvailabilityEditor } from "./availability-editor";

type OverlayMode = "union" | "intersection" | "heatmap";

interface Props {
  currentUserId: string;
  isAdmin: boolean;
  /** True when the viewer holds a can_manage role — enables editing own row. */
  canManage: boolean;
}

/** Browser-local weekday as a Weekday key. Mon=0 in our ordering. */
function todayWeekday(): Weekday {
  const day = new Date().getDay(); // 0=Sun..6=Sat
  const map: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[day];
}

export function TeamClockView({ currentUserId, isAdmin, canManage }: Props) {
  const [timezones, setTimezones] = useState<TeamClockTimezone[]>([]);
  const [r4s, setR4s] = useState<R4Availability[]>([]);
  const [selectedTzIds, setSelectedTzIds] = useState<Set<string>>(new Set());
  const [selectedR4Ids, setSelectedR4Ids] = useState<Set<string>>(new Set());
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("union");
  const [weekday, setWeekday] = useState<Weekday>(() => todayWeekday());
  const [editing, setEditing] = useState<R4Availability | null>(null);
  const [addingTz, setAddingTz] = useState(false);
  const [newTzIana, setNewTzIana] = useState("");
  const [newTzLabel, setNewTzLabel] = useState("");

  const loadAll = useCallback(async () => {
    const [tzRes, avRes] = await Promise.all([
      fetch("/api/team-clock/timezones"),
      fetch("/api/team-clock/availability"),
    ]);
    if (tzRes.ok) {
      const tz: TeamClockTimezone[] = await tzRes.json();
      setTimezones(tz);
      setSelectedTzIds((prev) => (prev.size === 0 ? new Set(tz.map((t) => t.id)) : prev));
    }
    if (avRes.ok) {
      const data: R4Availability[] = await avRes.json();
      setR4s(data);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const visibleTimezones = useMemo(
    () => timezones.filter((t) => selectedTzIds.has(t.id)),
    [timezones, selectedTzIds]
  );

  const selectedR4s = useMemo(
    () => r4s.filter((r) => selectedR4Ids.has(r.id)),
    [r4s, selectedR4Ids]
  );

  function toggleTz(id: string) {
    setSelectedTzIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleR4(id: string) {
    setSelectedR4Ids((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function deleteTz(id: string) {
    if (!confirm("Remove this timezone ring?")) return;
    const res = await fetch(`/api/team-clock/timezones/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTimezones((prev) => prev.filter((t) => t.id !== id));
      setSelectedTzIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  }

  async function addTz() {
    if (!newTzIana.trim() || !newTzLabel.trim()) return;
    const res = await fetch("/api/team-clock/timezones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iana: newTzIana.trim(), label: newTzLabel.trim() }),
    });
    if (res.ok) {
      const added: TeamClockTimezone = await res.json();
      setTimezones((prev) => [...prev, added]);
      setSelectedTzIds((prev) => new Set([...prev, added.id]));
      setNewTzIana("");
      setNewTzLabel("");
      setAddingTz(false);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Could not add timezone: ${err.error || res.status}`);
    }
  }

  function canEditR4(r: R4Availability): boolean {
    if (isAdmin) return true;
    if (canManage && r.id === currentUserId) return true;
    return false;
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 py-4 flex flex-col lg:flex-row gap-6">
        {/* Clock */}
        <div className="flex-1 flex flex-col items-center min-w-0">
          <div className="mb-3 flex items-center gap-2 flex-wrap justify-center">
            <label className="text-xs text-muted">Weekday:</label>
            <select
              value={weekday}
              onChange={(e) => setWeekday(e.target.value as Weekday)}
              className="px-2 py-1 rounded bg-background border border-border text-xs capitalize"
            >
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {selectedR4s.length > 0 && (
              <span className="text-xs text-muted ml-2">
                {selectedR4s.length} R4{selectedR4s.length === 1 ? "" : "s"} overlaid
              </span>
            )}
          </div>
          <RadialClock
            timezones={visibleTimezones}
            selectedR4s={selectedR4s}
            overlayMode={overlayMode}
            weekday={weekday}
          />
          {/* Period legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3 justify-center text-[11px] text-muted">
            {(Object.keys(PERIOD_LABELS) as Array<keyof typeof PERIOD_LABELS>).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm border border-border"
                  style={{ backgroundColor: PERIOD_FILL[k] }}
                />
                {PERIOD_LABELS[k]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#F5B33C]" />
              R4 available
            </span>
          </div>
        </div>

        {/* Side panel */}
        <aside className="w-full lg:w-72 flex-shrink-0 space-y-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
              R4 availability
            </h3>
            {r4s.length === 0 ? (
              <p className="text-xs text-muted/70">
                No R4s yet. Flip <code>can_manage</code> on an R4 role in{" "}
                <code>/admin/roles</code> to populate this list.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {r4s.map((r) => {
                  const checked = selectedR4Ids.has(r.id);
                  const hasGrid =
                    r.availability_utc &&
                    WEEKDAYS.some((d) => (r.availability_utc[d] || []).length > 0);
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 text-sm group"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleR4(r.id)}
                        className="accent-accent"
                      />
                      <span className="flex-1 truncate">
                        {r.display_name || "(no name)"}
                      </span>
                      {!hasGrid && (
                        <span
                          className="text-[10px] text-muted/70"
                          title="No availability set yet"
                        >
                          —
                        </span>
                      )}
                      {canEditR4(r) && (
                        <button
                          onClick={() => setEditing(r)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface-hover text-muted"
                          aria-label="Edit availability"
                          title="Edit availability"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
              Overlay mode
            </h3>
            <div className="space-y-1 text-sm">
              {(["union", "intersection", "heatmap"] as OverlayMode[]).map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="overlay"
                    checked={overlayMode === m}
                    onChange={() => setOverlayMode(m)}
                    className="accent-accent"
                  />
                  <span className="capitalize">{m}</span>
                  <span className="text-xs text-muted/70">
                    {m === "union" && "any R4 on"}
                    {m === "intersection" && "all selected R4s on"}
                    {m === "heatmap" && "shade by count"}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Timezone rings
              </h3>
              {isAdmin && (
                <button
                  onClick={() => setAddingTz((v) => !v)}
                  className="p-1 rounded hover:bg-surface-hover text-muted"
                  title="Add timezone"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {addingTz && isAdmin && (
              <div className="mb-2 p-2 rounded bg-background border border-border space-y-1.5">
                <input
                  type="text"
                  value={newTzIana}
                  onChange={(e) => setNewTzIana(e.target.value)}
                  placeholder="IANA id (e.g. Europe/Berlin)"
                  className="w-full px-2 py-1 rounded bg-surface border border-border text-xs"
                />
                <input
                  type="text"
                  value={newTzLabel}
                  onChange={(e) => setNewTzLabel(e.target.value)}
                  placeholder="Label (e.g. Berlin)"
                  className="w-full px-2 py-1 rounded bg-surface border border-border text-xs"
                />
                <button
                  onClick={addTz}
                  className="w-full px-2 py-1 rounded bg-accent text-black text-xs font-medium"
                >
                  Add ring
                </button>
              </div>
            )}
            <ul className="space-y-1">
              {timezones.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 text-sm group"
                >
                  <input
                    type="checkbox"
                    checked={selectedTzIds.has(t.id)}
                    onChange={() => toggleTz(t.id)}
                    className="accent-accent"
                  />
                  <span className="flex-1 truncate">{t.label}</span>
                  <span className="text-[10px] text-muted/60 font-mono truncate">
                    {t.iana}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => deleteTz(t.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface-hover text-red-400"
                      aria-label="Remove timezone"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {editing && (
        <AvailabilityEditor
          target={editing}
          onCancel={() => setEditing(null)}
          onSaved={(grid: AvailabilityGrid) => {
            setR4s((prev) =>
              prev.map((r) =>
                r.id === editing.id ? { ...r, availability_utc: grid } : r
              )
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
