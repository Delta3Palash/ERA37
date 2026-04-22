import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/team-clock/availability
 * Returns every R4-eligible profile (anyone holding a role with can_manage
 * = true) together with their availability_utc. Any authenticated user can
 * read — viewers of the Team Clock tab need this to render overlays.
 *
 * We intentionally don't include is_admin profiles here; the R4 panel is
 * about R4s. If a superadmin also holds a can_manage role they'll still
 * appear through that path.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  // 1. Roles with can_manage=true
  const { data: mgrRoles, error: rolesErr } = await svc
    .from("roles")
    .select("id")
    .eq("can_manage", true);
  if (rolesErr) return NextResponse.json({ error: rolesErr.message }, { status: 500 });
  const roleIds = (mgrRoles || []).map((r: { id: string }) => r.id);
  if (roleIds.length === 0) return NextResponse.json([]);

  // 2. Profile ids holding any of those roles
  const { data: assignments, error: assignErr } = await svc
    .from("profile_roles")
    .select("profile_id")
    .in("role_id", roleIds);
  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });
  const profileIds = Array.from(
    new Set((assignments || []).map((a: { profile_id: string }) => a.profile_id))
  );
  if (profileIds.length === 0) return NextResponse.json([]);

  // 3. Full profile rows with availability
  const { data, error } = await svc
    .from("profiles")
    .select("id, display_name, avatar_url, availability_utc")
    .in("id", profileIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    availability_utc: Record<string, number[]> | null;
  };
  const sorted = ((data || []) as Row[]).sort((a, b) =>
    (a.display_name || "").localeCompare(b.display_name || "")
  );
  return NextResponse.json(sorted);
}
