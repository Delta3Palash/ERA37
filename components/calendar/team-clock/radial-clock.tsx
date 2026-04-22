"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  R4Availability,
  TeamClockTimezone,
  Weekday,
} from "@/lib/types";
import { WEEKDAYS } from "@/lib/types";

type OverlayMode = "union" | "intersection" | "heatmap";

interface Props {
  /** Zones to render as rings, from innermost (UTC) outward. */
  timezones: TeamClockTimezone[];
  /** R4s whose availability to overlay. Pre-filtered by the side panel. */
  selectedR4s: R4Availability[];
  overlayMode: OverlayMode;
  /** Weekday used to index into each R4's availability grid. */
  weekday: Weekday;
  /** Size in CSS pixels (diameter). Component is square. */
  size?: number;
}

// Period thresholds from the alliance's Légende sheet:
//   00-05 Nuit, 06-11 Matin, 12-17 Journée, 18-23 Soirée
// Exact hex codes reused so users recognise the palette.
const PERIOD_FILL = {
  nuit: "#D0D8F0",
  matin: "#FFF3CD",
  journee: "#D4EDDA",
  soiree: "#E8D5F5",
} as const;

const PERIOD_STROKE = {
  nuit: "#8A9AC4",
  matin: "#D9B64A",
  journee: "#6FB47F",
  soiree: "#B891D6",
} as const;

function periodForLocalHour(h: number): keyof typeof PERIOD_FILL {
  if (h < 6) return "nuit";
  if (h < 12) return "matin";
  if (h < 18) return "journee";
  return "soiree";
}

/**
 * Return the local hour (0-23) in `tz` when UTC is `utcHour`. Uses Intl
 * directly against a fixed reference date — the radial clock shows a
 * *typical* day, so we don't need to worry about which specific date we
 * anchor to beyond current DST state.
 */
function localHourInZone(utcHour: number, tz: string): number {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  const hh = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  }).format(d);
  // en-GB gives "00" .. "23"
  return parseInt(hh, 10) % 24;
}

/** Build an SVG arc segment path covering one hour (15°) of a given ring. */
function arcPath(
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  startDeg: number,
  endDeg: number
): string {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + rOut * Math.cos(toRad(startDeg));
  const y1 = cy + rOut * Math.sin(toRad(startDeg));
  const x2 = cx + rOut * Math.cos(toRad(endDeg));
  const y2 = cy + rOut * Math.sin(toRad(endDeg));
  const x3 = cx + rIn * Math.cos(toRad(endDeg));
  const y3 = cy + rIn * Math.sin(toRad(endDeg));
  const x4 = cx + rIn * Math.cos(toRad(startDeg));
  const y4 = cy + rIn * Math.sin(toRad(startDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

export function RadialClock({
  timezones,
  selectedR4s,
  overlayMode,
  weekday,
  size = 820,
}: Props) {
  const cx = size / 2;
  const cy = size / 2;

  // Layout geometry.
  // Innermost ring is UTC itself (always shown).
  // Outer rings are the configured timezones in reverse sort-order so that
  // the ring closest to the center is the zone closest to UTC — matches the
  // user's mental model of "UTC is the anchor."
  const rings = useMemo(() => {
    const tzRings = [...timezones].sort((a, b) => a.sort_order - b.sort_order);
    return [
      { key: "utc", iana: "UTC", label: "UTC" },
      ...tzRings.map((t) => ({ key: t.id, iana: t.iana, label: t.label })),
    ];
  }, [timezones]);

  // Leave room for the R4 overlay band (22px) + a comfortable margin (24px).
  const innerRadius = 78;
  const reservedOuter = 22 + 24;
  const ringThickness = Math.max(
    26,
    Math.floor((size / 2 - innerRadius - reservedOuter) / rings.length)
  );
  const outerRadius = innerRadius + ringThickness * rings.length;

  // Current UTC hour for the sweep hand. Re-renders every minute.
  const [nowUtcHour, setNowUtcHour] = useState(() => new Date().getUTCHours());
  useEffect(() => {
    const id = setInterval(() => setNowUtcHour(new Date().getUTCHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Count of selected R4s available at each UTC hour on the chosen weekday.
  const hourOnCounts = useMemo(() => {
    const counts = new Array(24).fill(0);
    for (const r of selectedR4s) {
      const hours = r.availability_utc?.[weekday] || [];
      for (const h of hours) counts[h] += 1;
    }
    return counts;
  }, [selectedR4s, weekday]);

  const totalSelected = selectedR4s.length;

  /** Decide whether a given UTC hour should be overlaid given the mode. */
  function overlayAt(hour: number): { show: boolean; strength: number } {
    const c = hourOnCounts[hour];
    if (totalSelected === 0 || c === 0) return { show: false, strength: 0 };
    if (overlayMode === "union") return { show: true, strength: 1 };
    if (overlayMode === "intersection") {
      return c === totalSelected ? { show: true, strength: 1 } : { show: false, strength: 0 };
    }
    // heatmap: strength scales with count
    return { show: true, strength: c / totalSelected };
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-auto max-w-full select-none"
      style={{ maxHeight: "min(85vh, 1000px)" }}
      aria-label="Team availability clock"
    >
      {/* Radial-period rings (one <g> per ring) */}
      {rings.map((ring, ringIdx) => {
        const rIn = innerRadius + ringThickness * ringIdx;
        const rOut = rIn + ringThickness;
        return (
          <g key={ring.key}>
            {/* 24 hour segments */}
            {Array.from({ length: 24 }).map((_, hour) => {
              const startDeg = hour * 15;
              const endDeg = (hour + 1) * 15;
              const localHour =
                ring.iana === "UTC" ? hour : localHourInZone(hour, ring.iana);
              const period = periodForLocalHour(localHour);
              return (
                <path
                  key={hour}
                  d={arcPath(cx, cy, rIn, rOut, startDeg, endDeg)}
                  fill={PERIOD_FILL[period]}
                  stroke={PERIOD_STROKE[period]}
                  strokeOpacity={0.4}
                  strokeWidth={0.5}
                />
              );
            })}

            {/* Ring label sitting INSIDE the top (12 o'clock) segment, so
                labels stack vertically up the clock rather than smushing
                together at 3 o'clock. Stroke-as-paint-order gives each
                label a dark halo for readability against any period color. */}
            <text
              x={cx}
              y={cy - (rIn + rOut) / 2 + 4}
              textAnchor="middle"
              className="fill-foreground"
              style={{
                fontSize: Math.min(13, ringThickness * 0.48),
                fontWeight: 700,
                paintOrder: "stroke",
                stroke: "#0a0a0a",
                strokeWidth: 3,
                letterSpacing: 0.3,
              }}
            >
              {ring.label}
            </text>

            {/* Tooltip on any segment of the ring so hover/tap surfaces the
                IANA identity when the label text is abbreviated. */}
            <title>{`${ring.label} (${ring.iana})`}</title>
          </g>
        );
      })}

      {/* R4 overlay — single thick gold ring outside the outermost tz ring.
          Each hour segment is drawn with opacity = overlay strength. */}
      {totalSelected > 0 && (
        <g>
          {Array.from({ length: 24 }).map((_, hour) => {
            const { show, strength } = overlayAt(hour);
            if (!show) return null;
            const rIn = outerRadius + 4;
            const rOut = outerRadius + 18;
            const startDeg = hour * 15;
            const endDeg = (hour + 1) * 15;
            return (
              <path
                key={hour}
                d={arcPath(cx, cy, rIn, rOut, startDeg, endDeg)}
                fill="#F5B33C"
                fillOpacity={0.35 + 0.55 * strength}
                stroke="#F5B33C"
                strokeWidth={1}
              >
                <title>
                  UTC {String(hour).padStart(2, "0")}:00 — {hourOnCounts[hour]} of{" "}
                  {totalSelected} available
                </title>
              </path>
            );
          })}
        </g>
      )}

      {/* Current UTC hour highlight — a red radial spoke from inner to outer
          ring, centered on the current hour. Rotates as the hour ticks. */}
      <line
        x1={cx}
        y1={cy - innerRadius}
        x2={cx}
        y2={cy - outerRadius - 20}
        stroke="#E24242"
        strokeWidth={2}
        strokeLinecap="round"
        transform={`rotate(${nowUtcHour * 15 + 7.5} ${cx} ${cy})`}
      />

      {/* Hour tick labels at the OUTER edge of the outermost ring — outside
          the clock body so they don't crowd the center and stay legible at
          larger sizes. */}
      {Array.from({ length: 24 }).map((_, hour) => {
        const angle = hour * 15 + 7.5;
        const rad = ((angle - 90) * Math.PI) / 180;
        const r = outerRadius + 32;
        const tx = cx + r * Math.cos(rad);
        const ty = cy + r * Math.sin(rad) + 4;
        return (
          <text
            key={hour}
            x={tx}
            y={ty}
            textAnchor="middle"
            className="fill-muted"
            style={{
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-mono, ui-monospace)",
            }}
          >
            {String(hour).padStart(2, "0")}
          </text>
        );
      })}

      {/* Center: live UTC time + weekday. Sized relative to the inner disc
          so it scales with the overall clock. */}
      <circle
        cx={cx}
        cy={cy}
        r={innerRadius - 6}
        fill="#0a0a0a"
        stroke="#2a2a2a"
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        className="fill-accent"
        style={{
          fontSize: 34,
          fontWeight: 700,
          fontFamily: "var(--font-mono, ui-monospace)",
          letterSpacing: 1,
        }}
      >
        {String(nowUtcHour).padStart(2, "0")}:
        {String(new Date().getUTCMinutes()).padStart(2, "0")}
      </text>
      <text
        x={cx}
        y={cy + 22}
        textAnchor="middle"
        className="fill-muted"
        style={{ fontSize: 13, letterSpacing: 2, fontWeight: 600 }}
      >
        UTC · {weekday.toUpperCase()}
      </text>
    </svg>
  );
}

export const PERIOD_LABELS: Record<keyof typeof PERIOD_FILL, string> = {
  nuit: "🌙 Nuit (00–06)",
  matin: "🌅 Matin (06–12)",
  journee: "☀️ Journée (12–18)",
  soiree: "🌆 Soirée (18–24)",
};

export { PERIOD_FILL, WEEKDAYS as WEEKDAYS_RE };
