import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/access";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { CalendarEventType } from "@/lib/types";

const VALID_TYPES: CalendarEventType[] = ["growth", "attack", "defense", "rally"];

/**
 * Shared authorization for PATCH/DELETE on a single event.
 *
 * Rules:
 *  - Misc events: only is_admin (R5) can edit or delete, regardless of who
 *    created the event.
 *  - Alliance events: superadmins can edit or delete any event; delegated
 *    managers (can_manage) can only touch events they created themselves.
 */
type GateOk = {
  svc: SupabaseClient;
  existing: { id: string; kind: "alliance" | "misc"; created_by: string | null };
};
type GateErr = { error: NextResponse };

async function loadAndAuthorize(
  id: string,
  auth: Awaited<ReturnType<typeof requireManagerOrAdmin>>
): Promise<GateOk | GateErr> {
  if (auth.error) return { error: auth.error };
  const svc = createServiceClient();
  const { data: existing, error } = await svc
    .from("calendar_events")
    .select("id, kind, created_by")
    .eq("id", id)
    .single();
  if (error || !existing) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  if (existing.kind === "misc" && !auth.ctx.isAdmin) {
    return {
      error: NextResponse.json(
        { error: "Only superadmins can modify miscellaneous tasks" },
        { status: 403 }
      ),
    };
  }
  if (existing.kind === "alliance" && !auth.ctx.isAdmin && existing.created_by !== auth.ctx.userId) {
    return {
      error: NextResponse.json(
        { error: "You can only modify events you created" },
        { status: 403 }
      ),
    };
  }

  return { svc, existing };
}

function isErr(g: GateOk | GateErr): g is GateErr {
  return "error" in g;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  const gate = await loadAndAuthorize(id, auth);
  if (isErr(gate)) return gate.error;

  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    patch.title = t;
  }
  if (typeof body.event_type === "string") {
    if (!VALID_TYPES.includes(body.event_type as CalendarEventType)) {
      return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
    }
    patch.event_type = body.event_type;
  }
  if ("details" in body) patch.details = body.details ? String(body.details) : null;
  if ("starts_at" in body && body.starts_at) patch.starts_at = body.starts_at;
  if ("ends_at" in body) patch.ends_at = body.ends_at || null;
  if ("assigned_to" in body) patch.assigned_to = body.assigned_to || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await gate.svc
    .from("calendar_events")
    .update(patch)
    .eq("id", id)
    .select(
      "id, kind, event_type, title, details, starts_at, ends_at, assigned_to, created_by, created_at, assignee:profiles!calendar_events_assigned_to_fkey(id, display_name, avatar_url)"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  const gate = await loadAndAuthorize(id, auth);
  if (isErr(gate)) return gate.error;

  const { error } = await gate.svc.from("calendar_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
