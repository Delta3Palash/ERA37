import { createClient } from "@/lib/supabase/client";

const BUCKET = "calendar-screenshots";

/**
 * Upload a game-calendar screenshot from the browser. Grouped by week under
 * a `<week_start>/` prefix so "replace this week" can wipe the whole prefix
 * cheaply. The API route that calls this also inserts the matching row in
 * `game_calendar_images` so the image is discoverable.
 */
export async function uploadCalendarScreenshot(
  file: File,
  weekStart: string // YYYY-MM-DD
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "png";
  const path = `${weekStart}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
  });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Convenience: Monday (ISO) of the week containing `d`. Used client-side to
 * compute the bucket prefix consistently with the SQL `date_trunc('week', ...)`
 * value we store in `game_calendar_images.week_start`.
 */
export function mondayOf(d: Date = new Date()): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = copy.getUTCDay(); // 0=Sun ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy.toISOString().slice(0, 10);
}
