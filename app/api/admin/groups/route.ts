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

export async function GET() {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const svc = createServiceClient();
  const { data: groups, error } = await svc
    .from("channel_groups")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: links } = await svc.from("channel_group_connections").select("*");
  const byGroup: Record<string, string[]> = {};
  for (const l of links || []) {
    (byGroup[l.group_id] ||= []).push(l.connection_id);
  }

  return NextResponse.json(
    ((groups || []) as any[]).map((g) => ({
      ...g,
      connection_ids: byGroup[g.id] || [],
    }))
  );
}

export async function POST(req: NextRequest) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const body = await req.json();
  const name = (body.name || "").toString().trim();
  const minRolePriority = Number.isFinite(Number(body.min_role_priority))
    ? Number(body.min_role_priority)
    : 0;
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  const connectionIds: string[] = Array.isArray(body.connection_ids) ? body.connection_ids : [];

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const svc = createServiceClient();
  const { data: group, error } = await svc
    .from("channel_groups")
    .insert({ name, min_role_priority: minRolePriority, sort_order: sortOrder })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (connectionIds.length > 0) {
    const rows = connectionIds.map((id) => ({ group_id: group.id, connection_id: id }));
    const { error: linkErr } = await svc.from("channel_group_connections").insert(rows);
    if (linkErr) {
      // Group created but links failed — surface the error so the admin can retry
      return NextResponse.json(
        { ...group, warning: `Created but failed to attach connections: ${linkErr.message}` },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ ...group, connection_ids: connectionIds });
}
