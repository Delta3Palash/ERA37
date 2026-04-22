import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/access";
import { notifyAssignmentChange } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";
import type { CalendarEvent, CalendarEventType, CalendarKind } from "@/lib/types";

const VALID_TYPES: CalendarEventType[] = ["growth", "attack", "defense", "rally"];
const VALID_KINDS: CalendarKind[] = ["alliance", "misc", "game"];

// -----------------------------------------------------------------------------
// GET /api/calendar/events?kind=alliance&from=ISO&to=ISO
// Any authenticated user. `kind` is required; `from`/`to` are optional date
// window filters (ISO strings). Joins a tiny assignee projection so the UI
// doesn't need a second round-trip.
// -----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kind = req.nextUrl.searchParams.get("kind") as CalendarKind | null;
  if (!kind || !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "kind must be 'alliance' or 'misc'" }, { status: 400 });
  }
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const svc = createServiceClient();
  let query = svc
    .from("calendar_events")
    .select(
      "id, kind, event_type, title, details, starts_at, ends_at, assigned_to, created_by, created_at, assignee:profiles!calendar_events_assigned_to_fkey(id, display_name, avatar_url)"
    )
    .eq("kind", kind)
    .order("starts_at", { ascending: true });

  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lte("starts_at", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// -----------------------------------------------------------------------------
// POST /api/calendar/events
// Body: { kind, event_type, title, details?, starts_at, ends_at?, assigned_to? }
// Alliance: requires can_manage OR is_admin (R4+).
// Misc:     requires is_admin (R5 only).
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const body = await req.json();
  const kind = body.kind as CalendarKind;
  const event_type = body.event_type as CalendarEventType;
  const title = (body.title || "").toString().trim();
  const details = body.details ? body.details.toString() : null;
  const starts_at = body.starts_at;
  const ends_at = body.ends_at || null;
  const assigned_to = body.assigned_to || null;

  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!VALID_TYPES.includes(event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!starts_at) return NextResponse.json({ error: "starts_at is required" }, { status: 400 });
  if (kind === "misc" && !auth.ctx.isAdmin) {
    return NextResponse.json(
      { error: "Only superadmins can create miscellaneous tasks" },
      { status: 403 }
    );
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("calendar_events")
    .insert({
      kind,
      event_type,
      title,
      details,
      starts_at,
      ends_at,
      assigned_to,
      created_by: auth.ctx.userId,
    })
    .select(
      "id, kind, event_type, title, details, starts_at, ends_at, assigned_to, created_by, created_at, assignee:profiles!calendar_events_assigned_to_fkey(id, display_name, avatar_url)"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire notification for the freshly-assigned R4, if any. Never blocks
  // the response; the helper logs and swallows its own errors.
  await notifyAssignmentChange(svc, {
    // Supabase returns the embedded `assignee` as an array; the notifier
    // only reads id/title/kind/starts_at so the shape mismatch is safe.
    event: data as unknown as CalendarEvent,
    oldAssigneeId: null,
    newAssigneeId: assigned_to,
    actorId: auth.ctx.userId,
  });

  return NextResponse.json(data);
}
