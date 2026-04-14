import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canManagePriority, requireManagerOrAdmin } from "@/lib/access";

async function gateGroup(groupId: string, svc: ReturnType<typeof createServiceClient>) {
  const { data: group } = await svc
    .from("channel_groups")
    .select("min_role_priority")
    .eq("id", groupId)
    .single();
  return group;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const { id: groupId } = await params;
  const { connectionId } = await req.json();
  if (!connectionId)
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });

  const svc = createServiceClient();
  const group = await gateGroup(groupId, svc);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (!canManagePriority(auth.ctx, group.min_role_priority)) {
    return NextResponse.json(
      { error: "You cannot edit connections on a group at or above your priority" },
      { status: 403 }
    );
  }

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
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const { id: groupId } = await params;
  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get("connectionId");
  if (!connectionId)
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });

  const svc = createServiceClient();
  const group = await gateGroup(groupId, svc);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (!canManagePriority(auth.ctx, group.min_role_priority)) {
    return NextResponse.json(
      { error: "You cannot edit connections on a group at or above your priority" },
      { status: 403 }
    );
  }

  const { error } = await svc
    .from("channel_group_connections")
    .delete()
    .eq("group_id", groupId)
    .eq("connection_id", connectionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
