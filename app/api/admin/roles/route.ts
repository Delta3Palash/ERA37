import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canManagePriority, requireManagerOrAdmin } from "@/lib/access";

export async function GET() {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("roles")
    .select("*")
    .order("priority", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;

  const body = await req.json();
  const name = (body.name || "").toString().trim();
  const color = (body.color || "#737373").toString().trim();
  const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0;
  const canManageFlag = !!body.can_manage;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!/^#[0-9a-fA-F]{6}$/.test(color))
    return NextResponse.json({ error: "Color must be a 6-digit hex" }, { status: 400 });

  // Delegated managers can only create roles strictly below their priority,
  // and cannot mint new delegated managers above themselves. Superadmins pass.
  if (!canManagePriority(auth.ctx, priority)) {
    return NextResponse.json(
      { error: "You can only create roles below your own priority" },
      { status: 403 }
    );
  }

  // Only superadmins can mint new can_manage roles. This prevents a
  // delegated R5 from creating a stealth R4 with can_manage=true.
  if (canManageFlag && !auth.ctx.isAdmin) {
    return NextResponse.json(
      { error: "Only superadmins can mark a role as can_manage" },
      { status: 403 }
    );
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("roles")
    .insert({ name, color, priority, can_manage: canManageFlag })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
