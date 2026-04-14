export const dynamic = "force-dynamic";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { GroupsManager } from "@/components/admin-groups-manager";
import { getUserAccess } from "@/lib/access";
import type { Connection, Role } from "@/lib/types";

export default async function AdminGroupsPage() {
  const supabase = await createClient();
  const svc = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();
  const access = await getUserAccess(supabase, user!.id);

  const { data: groups } = await svc
    .from("channel_groups")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: links } = await svc.from("channel_group_connections").select("*");
  const byGroup: Record<string, string[]> = {};
  for (const l of links || []) (byGroup[l.group_id] ||= []).push(l.connection_id);

  const { data: connections } = await svc
    .from("connections")
    .select("*")
    .order("platform");

  const { data: roles } = await svc
    .from("roles")
    .select("*")
    .order("priority", { ascending: false });

  const enrichedGroups = ((groups as any[]) || []).map((g) => ({
    ...g,
    connection_ids: byGroup[g.id] || [],
  }));

  return (
    <GroupsManager
      initialGroups={enrichedGroups}
      connections={(connections as Connection[]) || []}
      roles={(roles as Role[]) || []}
      isAdmin={!!profile?.is_admin}
      userPriority={access.userPriority}
    />
  );
}
