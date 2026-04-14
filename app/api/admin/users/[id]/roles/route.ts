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

// Assign a role to a user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id: profileId } = await params;
  const { roleId } = await req.json();
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });

  const svc = createServiceClient();
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
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id: profileId } = await params;
  const { searchParams } = new URL(req.url);
  const roleId = searchParams.get("roleId");
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("profile_roles")
    .delete()
    .eq("profile_id", profileId)
    .eq("role_id", roleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
