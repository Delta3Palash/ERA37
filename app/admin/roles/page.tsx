export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { RolesManager } from "@/components/admin-roles-manager";
import { getUserAccess } from "@/lib/access";
import type { Role } from "@/lib/types";

export default async function AdminRolesPage() {
  const supabase = await createClient();
  const svc = createServiceClient();

  // Layout already gated on is_admin || canManage, but we still need the
  // caller's priority + flags for the UI to know what they can edit.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();
  const access = await getUserAccess(supabase, user!.id);

  const { data: roles } = await svc
    .from("roles")
    .select("*")
    .order("priority", { ascending: false });

  // Count assignments per role so the UI can disable delete when in use
  const { data: assignments } = await svc.from("profile_roles").select("role_id");
  const counts: Record<string, number> = {};
  for (const a of assignments || []) counts[a.role_id] = (counts[a.role_id] || 0) + 1;

  return (
    <RolesManager
      initial={(roles as Role[]) || []}
      assignmentCounts={counts}
      isAdmin={!!profile?.is_admin}
      userPriority={access.userPriority}
    />
  );
}
