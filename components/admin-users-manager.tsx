"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Shield } from "lucide-react";
import type { Role } from "@/lib/types";

interface AdminUserRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  role_ids: string[];
}

interface Props {
  users: AdminUserRow[];
  roles: Role[];
  isAdmin: boolean;
  userPriority: number;
}

export function UsersManager({ users, roles, isAdmin, userPriority }: Props) {
  const rolesById = new Map(roles.map((r) => [r.id, r]));
  const [query, setQuery] = useState("");

  // Delegated managers can only assign roles strictly below their own priority.
  const assignableRoles = isAdmin ? roles : roles.filter((r) => r.priority < userPriority);

  function canManageRole(roleId: string): boolean {
    if (isAdmin) return true;
    const role = rolesById.get(roleId);
    if (!role) return false;
    return role.priority < userPriority;
  }

  const filtered = users.filter((u) =>
    (u.display_name || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <section className="bg-surface rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-muted">
            {isAdmin
              ? "Assign one or more roles to each member."
              : `You can assign roles below priority ${userPriority}.`}
          </p>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:border-accent"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">No users.</p>
        ) : (
          filtered.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              assignableRoles={assignableRoles}
              rolesById={rolesById}
              canManageRole={canManageRole}
            />
          ))
        )}
      </div>
    </section>
  );
}

function UserRow({
  user,
  assignableRoles,
  rolesById,
  canManageRole,
}: {
  user: AdminUserRow;
  assignableRoles: Role[];
  rolesById: Map<string, Role>;
  canManageRole: (roleId: string) => boolean;
}) {
  const router = useRouter();
  const [localRoleIds, setLocalRoleIds] = useState<string[]>(user.role_ids);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function addRole(roleId: string) {
    if (localRoleIds.includes(roleId)) {
      setPicking(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      if (res.ok) {
        setLocalRoleIds((prev) => [...prev, roleId]);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to add role");
      }
    } finally {
      setBusy(false);
      setPicking(false);
    }
  }

  async function removeRole(roleId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/roles?roleId=${roleId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setLocalRoleIds((prev) => prev.filter((id) => id !== roleId));
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to remove role");
      }
    } finally {
      setBusy(false);
    }
  }

  const unassigned = assignableRoles.filter((r) => !localRoleIds.includes(r.id));

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-xs text-muted">
          {(user.display_name || "?")[0].toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{user.display_name || "Unknown"}</span>
          {user.is_admin && (
            <span className="inline-flex items-center gap-1 text-[10px] text-accent">
              <Shield className="w-3 h-3" /> admin
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-1 items-center">
          {localRoleIds.map((rid) => {
            const role = rolesById.get(rid);
            if (!role) return null;
            const manageable = canManageRole(rid);
            return (
              <span
                key={rid}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                style={{
                  backgroundColor: `${role.color}22`,
                  color: role.color,
                  borderColor: `${role.color}55`,
                }}
              >
                {role.name}
                {manageable && (
                  <button
                    onClick={() => removeRole(rid)}
                    disabled={busy}
                    className="ml-0.5 hover:opacity-70"
                    title="Remove role"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            );
          })}
          {unassigned.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setPicking(!picking)}
                disabled={busy}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted border border-dashed border-border hover:text-foreground hover:border-foreground/30"
              >
                <Plus className="w-2.5 h-2.5" /> role
              </button>
              {picking && (
                <div className="absolute top-full left-0 mt-1 z-10 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                  {unassigned.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => addRole(r.id)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover flex items-center gap-2"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
