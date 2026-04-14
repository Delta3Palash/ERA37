import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelGroup, Connection, Role } from "@/lib/types";
import { effectivePriority } from "@/lib/types";

export interface UserAccess {
  userPriority: number;
  userRoles: Role[];
  groups: (ChannelGroup & { connections: Connection[] })[];
  accessibleConnections: Connection[];
  accessibleConnectionIds: string[];
  /**
   * Map of profile_id -> Role[] (priority desc). Plain object so it is safe
   * to pass from server components to client props (Maps don't serialize).
   */
  roleMap: Record<string, Role[]>;
}

/**
 * Loads channel groups + role badges in a single pass and filters groups by
 * the current user's effective priority. Used by `app/chat/layout.tsx` and
 * the chat pages so access enforcement is defined in one place.
 */
export async function getUserAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<UserAccess> {
  // 1. Current user's roles (to compute effective priority)
  const { data: currentAssignments } = await supabase
    .from("profile_roles")
    .select("role_id, roles(*)")
    .eq("profile_id", userId);

  const userRoles: Role[] = (currentAssignments || [])
    .map((row: any) => row.roles as Role)
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);
  const userPriority = effectivePriority(userRoles);

  // 2. All channel groups + their connections via the join table
  const { data: rawGroups } = await supabase
    .from("channel_groups")
    .select("*, channel_group_connections(connection_id, connections(*))")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const allGroups: (ChannelGroup & { connections: Connection[] })[] = (rawGroups || []).map(
    (g: any) => ({
      id: g.id,
      name: g.name,
      min_role_priority: g.min_role_priority,
      sort_order: g.sort_order,
      created_at: g.created_at,
      connections: (g.channel_group_connections || [])
        .map((cgc: any) => cgc.connections as Connection)
        .filter(Boolean),
    })
  );

  const groups = allGroups.filter((g) => userPriority >= g.min_role_priority);

  // Deduplicate connections across groups
  const connById = new Map<string, Connection>();
  for (const g of groups) {
    for (const c of g.connections) connById.set(c.id, c);
  }
  const accessibleConnections = Array.from(connById.values());
  const accessibleConnectionIds = accessibleConnections.map((c) => c.id);

  // 3. Role map for chat badges — one fetch across all profiles
  const { data: allAssignments } = await supabase
    .from("profile_roles")
    .select("profile_id, roles(*)");

  const roleMap: Record<string, Role[]> = {};
  for (const row of (allAssignments || []) as any[]) {
    const role = row.roles as Role;
    if (!role) continue;
    (roleMap[row.profile_id] ||= []).push(role);
  }
  // Sort each user's roles by priority desc for stable display order
  for (const key of Object.keys(roleMap)) {
    roleMap[key].sort((a, b) => b.priority - a.priority);
  }

  return {
    userPriority,
    userRoles,
    groups,
    accessibleConnections,
    accessibleConnectionIds,
    roleMap,
  };
}
