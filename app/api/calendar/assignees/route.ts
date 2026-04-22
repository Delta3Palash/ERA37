import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Returns the list of profiles eligible to be "R4 in charge" of a calendar
 * event — anyone with `is_admin = true` OR any role with `can_manage = true`.
 * Used by the calendar UI's assignee picker.
 *
 * Any authenticated user can query this; the result is just display names.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  // Superadmins
  const { data: admins, error: adminErr } = await svc
    .from("profiles")
    .select("id, display_name, avatar_url, is_admin")
    .eq("is_admin", true);
  if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });

  // Anyone holding a can_manage role — resolved via profile_roles join
  const { data: managerRows, error: mgrErr } = await svc
    .from("profile_roles")
    .select("profile_id, roles!inner(can_manage), profiles!inner(id, display_name, avatar_url)")
    .eq("roles.can_manage", true);
  if (mgrErr) return NextResponse.json({ error: mgrErr.message }, { status: 500 });

  // Dedupe by profile id — a superadmin might also hold a can_manage role
  const byId = new Map<string, { id: string; display_name: string | null; avatar_url: string | null }>();
  for (const p of admins || []) {
    byId.set(p.id, { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url });
  }
  for (const row of (managerRows || []) as any[]) {
    const p = row.profiles;
    if (!p) continue;
    if (!byId.has(p.id)) {
      byId.set(p.id, { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url });
    }
  }

  const assignees = Array.from(byId.values()).sort((a, b) =>
    (a.display_name || "").localeCompare(b.display_name || "")
  );
  return NextResponse.json(assignees);
}
