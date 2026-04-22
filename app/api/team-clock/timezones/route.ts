import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/access";
import { NextRequest, NextResponse } from "next/server";

// GET /api/team-clock/timezones — public to any authenticated user.
// Returns the ordered list of IANA zones the radial clock displays.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("team_clock_timezones")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST /api/team-clock/timezones — is_admin only. Appends a new zone at the
// end of the sort order. Body: { iana: string, label: string }.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;
  if (!auth.ctx.isAdmin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const iana = String(body.iana || "").trim();
  const label = String(body.label || "").trim();
  if (!iana) return NextResponse.json({ error: "iana required" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  // Validate that Intl recognises the zone — prevents typos silently breaking
  // the clock for everyone.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: iana });
  } catch {
    return NextResponse.json({ error: `Invalid IANA zone: ${iana}` }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: maxRow } = await svc
    .from("team_clock_timezones")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const next = maxRow && maxRow.length > 0 ? maxRow[0].sort_order + 10 : 10;

  const { data, error } = await svc
    .from("team_clock_timezones")
    .insert({ iana, label, sort_order: next })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
