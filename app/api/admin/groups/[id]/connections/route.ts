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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id: groupId } = await params;
  const { connectionId } = await req.json();
  if (!connectionId)
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("channel_group_connections")
    .insert({ group_id: groupId, connection_id: connectionId });
  if (error && !error.message.includes("duplicate"))
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const { id: groupId } = await params;
  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get("connectionId");
  if (!connectionId)
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("channel_group_connections")
    .delete()
    .eq("group_id", groupId)
    .eq("connection_id", connectionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
