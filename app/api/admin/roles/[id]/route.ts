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

  // Fetch the current role so we can priority-gate the edit.
  const { data: current } = await svc
    .from("roles")
    .select("*")
    .eq("id", id)
    .single();
  if (!current) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  // Managers can only edit roles strictly below their priority. Superadmins pass.
  if (!canManagePriority(auth.ctx, current.priority)) {
    return NextResponse.json(
      { error: "You cannot edit a role at or above your own priority" },
      { status: 403 }
    );
  }

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
    // A manager can't raise a role above or equal to their own priority.
    if (!canManagePriority(auth.ctx, p)) {
      return NextResponse.json(
        { error: "New priority must be below your own" },
        { status: 403 }
      );
    }
    patch.priority = p;
  }
  if (body.can_manage !== undefined) {
    if (!auth.ctx.isAdmin) {
      return NextResponse.json(
        { error: "Only superadmins can toggle can_manage" },
        { status: 403 }
      );
    }
    patch.can_manage = !!body.can_manage;
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

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
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: current } = await svc
    .from("roles")
    .select("priority")
    .eq("id", id)
    .single();
  if (!current) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (!canManagePriority(auth.ctx, current.priority)) {
    return NextResponse.json(
      { error: "You cannot delete a role at or above your own priority" },
      { status: 403 }
    );
  }

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
