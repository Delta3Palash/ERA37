export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { UsersManager } from "@/components/admin-users-manager";
import { getUserAccess } from "@/lib/access";
import type { Role } from "@/lib/types";

export interface AdminUserRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  role_ids: string[];
}

export default async function AdminUsersPage() {
  const supabase = await createClient();
  // The layout already gates /admin, but the `profiles` RLS policy
  // restricts SELECT to `auth.uid() = id` — so we need the service client
  // to list all members.
  const svc = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();
  const access = await getUserAccess(supabase, user!.id);

  const { data: profiles } = await svc
    .from("profiles")
    .select("id, display_name, avatar_url, is_admin")
    .order("display_name", { ascending: true });

  const { data: assignments } = await svc
    .from("profile_roles")
    .select("profile_id, role_id");

  const byProfile: Record<string, string[]> = {};
  for (const a of assignments || []) {
    (byProfile[a.profile_id] ||= []).push(a.role_id);
  }

  const users: AdminUserRow[] = ((profiles as any[]) || []).map((p) => ({
    id: p.id,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    is_admin: p.is_admin,
    role_ids: byProfile[p.id] || [],
  }));

  const { data: roles } = await svc
    .from("roles")
    .select("*")
    .order("priority", { ascending: false });

  return (
    <UsersManager
      users={users}
      roles={(roles as Role[]) || []}
      isAdmin={!!callerProfile?.is_admin}
      userPriority={access.userPriority}
    />
  );
}
