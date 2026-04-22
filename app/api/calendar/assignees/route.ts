import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Returns the list of profiles eligible to be "R4 in charge" of a calendar
 * event — any profile holding at least one role flagged `can_manage = true`.
 *
 * Implementation is intentionally a 3-step lookup rather than a nested
 * PostgREST embed. The previous embed `roles!inner(can_manage)` with
 * `.eq("roles.can_manage", true)` was silently returning zero rows on
 * Supabase — the embedded-filter path is finicky when the join goes through
 * a composite-key link table like profile_roles.
 *
 * Any authenticated user can call this; the response is just display names.
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

  // 2. Profiles holding any of those roles (dedupe)
  const { data: assignments, error: assignErr } = await svc
    .from("profile_roles")
    .select("profile_id")
    .in("role_id", roleIds);
  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });
  const profileIds = Array.from(
    new Set((assignments || []).map((a: { profile_id: string }) => a.profile_id))
  );
  if (profileIds.length === 0) return NextResponse.json([]);

  // 3. Profile display data
  const { data: profiles, error: profErr } = await svc
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", profileIds);
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  type P = { id: string; display_name: string | null; avatar_url: string | null };
  const sorted = ((profiles || []) as P[]).sort((a, b) =>
    (a.display_name || "").localeCompare(b.display_name || "")
  );
  return NextResponse.json(sorted);
}
