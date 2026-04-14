import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { ChannelGroup, Connection, Role } from "@/lib/types";
import { effectivePriority } from "@/lib/types";

export interface UserAccess {
  userPriority: number;
  userRoles: Role[];
  /**
   * True when the user holds at least one role with `can_manage = true`.
   * Independent of `is_admin` — a superadmin is always treated as having
   * full management power regardless of `canManage`.
   */
  canManage: boolean;
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
  const canManage = userRoles.some((r) => r.can_manage);

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
    canManage,
    groups,
    accessibleConnections,
    accessibleConnectionIds,
    roleMap,
  };
}

export interface AdminAuthContext {
  userId: string;
  isAdmin: boolean;
  canManage: boolean;
  userPriority: number;
}

/**
 * Shared admin-API guard. Accepts either is_admin or a role with
 * can_manage=true. Returns the caller's effective priority + flags so
 * routes can enforce the "strictly below my priority" rule for
 * delegated managers. Superadmins bypass the priority check.
 */
export async function requireManagerOrAdmin(
  supabase: SupabaseClient
): Promise<{ error: NextResponse; ctx?: undefined } | { error?: undefined; ctx: AdminAuthContext }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  const isAdmin = !!profile?.is_admin;

  const { data: assignments } = await supabase
    .from("profile_roles")
    .select("roles(*)")
    .eq("profile_id", user.id);
  const roles: Role[] = (assignments || [])
    .map((r: any) => r.roles as Role)
    .filter(Boolean);
  const canManage = roles.some((r) => r.can_manage);
  const userPriority = effectivePriority(roles);

  if (!isAdmin && !canManage) {
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }

  return { ctx: { userId: user.id, isAdmin, canManage, userPriority } };
}

/**
 * Check whether the caller can manage something at the given priority.
 * Superadmins pass unconditionally; delegated managers require their
 * effective priority to be STRICTLY greater than the target's priority.
 */
export function canManagePriority(ctx: AdminAuthContext, targetPriority: number): boolean {
  if (ctx.isAdmin) return true;
  return ctx.canManage && ctx.userPriority > targetPriority;
}
