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
  if (typeof body.color === "string") {
    if (!/^#[0-9a-fA-F]{6}$/.test(body.color))
      return NextResponse.json({ error: "Color must be a 6-digit hex" }, { status: 400 });
    patch.color = body.color;
  }
  if (body.priority !== undefined) {
    const p = Number(body.priority);
    if (!Number.isFinite(p))
      return NextResponse.json({ error: "Priority must be a number" }, { status: 400 });
    patch.priority = p;
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("roles")
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

  // Refuse if assigned to any profile
  const { count } = await svc
    .from("profile_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", id);
  if ((count || 0) > 0) {
    return NextResponse.json(
      { error: `Role is assigned to ${count} user(s). Remove assignments first.` },
      { status: 409 }
    );
  }

  const { error } = await svc.from("roles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
