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
  const { data, error } = await svc
    .from("roles")
    .select("*")
    .order("priority", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const check = await requireAdmin();
  if (check.error) return check.error;

  const body = await req.json();
  const name = (body.name || "").toString().trim();
  const color = (body.color || "#737373").toString().trim();
  const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!/^#[0-9a-fA-F]{6}$/.test(color))
    return NextResponse.json({ error: "Color must be a 6-digit hex" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("roles")
    .insert({ name, color, priority })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
