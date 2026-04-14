export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { GroupsManager } from "@/components/admin-groups-manager";
import type { Connection, Role } from "@/lib/types";

export default async function AdminGroupsPage() {
  const supabase = await createClient();

  const { data: groups } = await supabase
    .from("channel_groups")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: links } = await supabase.from("channel_group_connections").select("*");
  const byGroup: Record<string, string[]> = {};
  for (const l of links || []) (byGroup[l.group_id] ||= []).push(l.connection_id);

  const { data: connections } = await supabase
    .from("connections")
    .select("*")
    .order("platform");

  const { data: roles } = await supabase
    .from("roles")
    .select("*")
    .order("priority", { ascending: false });

  const enrichedGroups = (groups || []).map((g) => ({
    ...g,
    connection_ids: byGroup[g.id] || [],
  }));

  return (
    <GroupsManager
      initialGroups={enrichedGroups}
      connections={(connections as Connection[]) || []}
      roles={(roles as Role[]) || []}
    />
  );
}
