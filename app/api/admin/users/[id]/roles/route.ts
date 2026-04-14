import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canManagePriority, requireManagerOrAdmin } from "@/lib/access";

// Assign a role to a user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const { id: profileId } = await params;
  const { roleId } = await req.json();
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });

  const svc = createServiceClient();

  // Look up the target role's priority and gate on it.
  const { data: role } = await svc
    .from("roles")
    .select("priority")
    .eq("id", roleId)
    .single();
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (!canManagePriority(auth.ctx, role.priority)) {
    return NextResponse.json(
      { error: "You cannot assign a role at or above your priority" },
      { status: 403 }
    );
  }

  const { error } = await svc
    .from("profile_roles")
    .insert({ profile_id: profileId, role_id: roleId });
  if (error && !error.message.includes("duplicate"))
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// Remove a role from a user
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const { id: profileId } = await params;
  const { searchParams } = new URL(req.url);
  const roleId = searchParams.get("roleId");
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: role } = await svc
    .from("roles")
    .select("priority")
    .eq("id", roleId)
    .single();
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (!canManagePriority(auth.ctx, role.priority)) {
    return NextResponse.json(
      { error: "You cannot remove a role at or above your priority" },
      { status: 403 }
    );
  }

  const { error } = await svc
    .from("profile_roles")
    .delete()
    .eq("profile_id", profileId)
    .eq("role_id", roleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
