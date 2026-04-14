import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canManagePriority, requireManagerOrAdmin } from "@/lib/access";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const svc = createServiceClient();

  const { data: current } = await svc
    .from("channel_groups")
    .select("*")
    .eq("id", id)
    .single();
  if (!current) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (!canManagePriority(auth.ctx, current.min_role_priority)) {
    return NextResponse.json(
      { error: "You cannot edit a group at or above your priority" },
      { status: 403 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.min_role_priority !== undefined) {
    const p = Number(body.min_role_priority);
    if (!Number.isFinite(p))
      return NextResponse.json({ error: "min_role_priority must be a number" }, { status: 400 });
    if (!canManagePriority(auth.ctx, p)) {
      return NextResponse.json(
        { error: "New min_role_priority must be below your own" },
        { status: 403 }
      );
    }
    patch.min_role_priority = p;
  }
  if (body.sort_order !== undefined) {
    const s = Number(body.sort_order);
    if (!Number.isFinite(s))
      return NextResponse.json({ error: "sort_order must be a number" }, { status: 400 });
    patch.sort_order = s;
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const { data, error } = await svc
    .from("channel_groups")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: current } = await svc
    .from("channel_groups")
    .select("min_role_priority")
    .eq("id", id)
    .single();
  if (!current) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (!canManagePriority(auth.ctx, current.min_role_priority)) {
    return NextResponse.json(
      { error: "You cannot delete a group at or above your priority" },
      { status: 403 }
    );
  }

  const { error } = await svc.from("channel_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
