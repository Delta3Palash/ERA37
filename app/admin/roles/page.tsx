export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { RolesManager } from "@/components/admin-roles-manager";
import type { Role } from "@/lib/types";

export default async function AdminRolesPage() {
  const supabase = await createClient();

  const { data: roles } = await supabase
    .from("roles")
    .select("*")
    .order("priority", { ascending: false });

  // Count assignments per role so the UI can disable delete when in use
  const { data: assignments } = await supabase.from("profile_roles").select("role_id");
  const counts: Record<string, number> = {};
  for (const a of assignments || []) counts[a.role_id] = (counts[a.role_id] || 0) + 1;

  return <RolesManager initial={(roles as Role[]) || []} assignmentCounts={counts} />;
}
