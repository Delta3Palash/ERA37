import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/access";
import { NextRequest, NextResponse } from "next/server";

// -----------------------------------------------------------------------------
// GET /api/calendar/game?weeks=8
// Any authenticated user. Returns game-calendar images for the most recent N
// weeks (default 8), ordered by week_start DESC, sort_order ASC. Grouped into
// { week_start, images[] } on the client.
// -----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weeks = Math.max(
    1,
    Math.min(52, Number(req.nextUrl.searchParams.get("weeks") || "8"))
  );

  const svc = createServiceClient();
  // Cheapest way to bound to "last N weeks": filter week_start >= today - N*7 days.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data, error } = await svc
    .from("game_calendar_images")
    .select("*")
    .gte("week_start", cutoffDate)
    .order("week_start", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// -----------------------------------------------------------------------------
// POST /api/calendar/game
// Body: { week_start: "YYYY-MM-DD", image_url: "<public-url>" }
// is_admin only. The actual upload to storage happens client-side (see
// lib/calendar-upload.ts) — this route just records the row so the image
// is discoverable via GET. sort_order is assigned server-side as (max + 1).
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;
  if (!auth.ctx.isAdmin) {
    return NextResponse.json(
      { error: "Only superadmins can upload game calendar screenshots" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const week_start = String(body.week_start || "").trim();
  const image_url = String(body.image_url || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return NextResponse.json({ error: "week_start must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!image_url) {
    return NextResponse.json({ error: "image_url is required" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Compute next sort_order for this week in a single round-trip
  const { data: existing, error: maxErr } = await svc
    .from("game_calendar_images")
    .select("sort_order")
    .eq("week_start", week_start)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (maxErr) return NextResponse.json({ error: maxErr.message }, { status: 500 });
  const nextSort = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await svc
    .from("game_calendar_images")
    .insert({
      week_start,
      image_url,
      sort_order: nextSort,
      uploaded_by: auth.ctx.userId,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
