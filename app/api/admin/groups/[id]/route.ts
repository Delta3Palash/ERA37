import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin)
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  return { user };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  const body = await req.json();

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.min_role_priority !== undefined) {
    const p = Number(body.min_role_priority);
    if (!Number.isFinite(p))
      return NextResponse.json({ error: "min_role_priority must be a number" }, { status: 400 });
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

  const svc = createServiceClient();
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
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id } = await params;
  const svc = createServiceClient();

  // FK cascade handles channel_group_connections
  const { error } = await svc.from("channel_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
