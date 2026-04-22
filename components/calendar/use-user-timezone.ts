"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Hook: the current user's preferred timezone (IANA). Fetched once from
 * profiles.preferred_timezone; falls back to the browser's resolved timezone
 * while loading or if the column is unset.
 *
 * Pair with `formatInTimezone(date, tz)` below to render event times.
 */
export function useUserTimezone(): string {
  const supabase = useMemo(() => createClient(), []);
  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const [tz, setTz] = useState<string>(browserTz || "UTC");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("preferred_timezone")
        .eq("id", user.id)
        .single();
      if (data?.preferred_timezone) setTz(data.preferred_timezone);
    })();
  }, [supabase]);

  return tz;
}

/** Format an ISO/Date in a given IANA zone as e.g. "Wed, Apr 23 · 01:00". */
export function formatInTimezone(
  value: string | Date,
  tz: string,
  opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz }).format(d);
}

/** Format just the time portion (HH:mm) in a given zone. */
export function formatTimeInTimezone(value: string | Date, tz: string): string {
  return formatInTimezone(value, tz, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Take a `<input type="datetime-local">` value (YYYY-MM-DDTHH:mm, in the
 * browser's local zone) and return "UTC YYYY-MM-DD HH:mm" for display.
 * Game events in AoE Mobile are UTC-scheduled so showing the UTC equivalent
 * next to the local input lets users sanity-check without a mental conversion.
 * Returns an empty string for invalid / empty inputs.
 */
export function utcPreview(localInput: string): string {
  if (!localInput) return "";
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `UTC ${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
