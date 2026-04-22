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
