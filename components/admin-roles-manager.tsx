"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X, Shield } from "lucide-react";
import type { Role } from "@/lib/types";

interface Props {
  initial: Role[];
  assignmentCounts: Record<string, number>;
  isAdmin: boolean;
  userPriority: number;
}

export function RolesManager({ initial, assignmentCounts, isAdmin, userPriority }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#FFA800");
  const [priority, setPriority] = useState(10);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delegated managers can only create roles strictly below their own
  // priority; superadmins have no ceiling.
  const priorityCeiling = isAdmin ? Number.POSITIVE_INFINITY : userPriority;

  function canEditRole(role: Role): boolean {
    if (isAdmin) return true;
    return role.priority < userPriority;
  }

  async function createRole() {
    if (!name.trim()) return;
    if (priority >= priorityCeiling) {
      setError(`Priority must be below your own (${userPriority})`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color, priority, can_manage: canManage }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create role");
      }
      setName("");
      setColor("#FFA800");
      setPriority(10);
      setCanManage(false);
      setCreating(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-surface rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Roles</h2>
          <p className="text-sm text-muted">
            {isAdmin
              ? "Higher priority can access more channel groups. Mark a role as manager to let its holders delegate admin tasks."
              : `You can manage roles with priority below ${userPriority}.`}
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover"
          >
            <Plus className="w-4 h-4" /> New role
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-4 p-4 rounded-lg bg-background border border-border space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Role name (e.g. R5, Rally Leader)"
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-9 rounded cursor-pointer bg-transparent"
              title="Role color"
            />
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              placeholder="Priority"
              className="w-24 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent"
              title={
                isAdmin
                  ? "Priority (higher = more senior)"
                  : `Priority must be below your own (${userPriority})`
              }
            />
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={canManage}
                onChange={(e) => setCanManage(e.target.checked)}
                className="accent-accent"
              />
              <Shield className="w-3 h-3" />
              <span>Can manage lower-priority roles, groups, and user assignments</span>
            </label>
          )}
          <div className="flex gap-2">
            <button
              onClick={createRole}
              disabled={saving || !name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setError(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-muted hover:bg-surface-hover"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}

      <div className="space-y-2">
        {initial.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">No roles yet.</p>
        ) : (
          initial.map((role) => (
            <RoleRow
              key={role.id}
              role={role}
              assignmentCount={assignmentCounts[role.id] || 0}
              canEdit={canEditRole(role)}
              isAdmin={isAdmin}
              userPriority={userPriority}
            />
          ))
        )}
      </div>
    </section>
  );
}

function RoleRow({
  role,
  assignmentCount,
  canEdit,
  isAdmin,
  userPriority,
}: {
  role: Role;
  assignmentCount: number;
  canEdit: boolean;
  isAdmin: boolean;
  userPriority: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [priority, setPriority] = useState(role.priority);
  const [canManage, setCanManage] = useState(role.can_manage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: any = { name, color, priority };
      if (isAdmin) body.can_manage = canManage;
      const res = await fetch(`/api/admin/roles/${role.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }
      setEditing(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to delete");
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <div className="p-3 rounded-lg bg-background border border-border space-y-2">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-9 rounded cursor-pointer bg-transparent"
          />
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-24 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground"
            title={
              isAdmin ? "Priority" : `Must stay below your priority (${userPriority})`
            }
          />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={canManage}
              onChange={(e) => setCanManage(e.target.checked)}
              className="accent-accent"
            />
            <Shield className="w-3 h-3" />
            <span>Can manage lower-priority roles and groups</span>
          </label>
        )}
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "..." : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-muted hover:bg-surface-hover"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border"
          style={{
            backgroundColor: `${role.color}22`,
            color: role.color,
            borderColor: `${role.color}55`,
          }}
        >
          {role.name}
        </span>
        <span className="text-xs text-muted">priority {role.priority}</span>
        {role.can_manage && (
          <span className="inline-flex items-center gap-1 text-[10px] text-accent">
            <Shield className="w-3 h-3" /> manager
          </span>
        )}
        <span className="text-xs text-muted">
          {assignmentCount} user{assignmentCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {canEdit ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-accent hover:underline"
          >
            Edit
          </button>
        ) : (
          <span className="text-xs text-muted/60">locked</span>
        )}
        <button
          onClick={remove}
          disabled={!canEdit || assignmentCount > 0}
          title={
            !canEdit
              ? "Above your priority"
              : assignmentCount > 0
                ? "Remove role from all users first"
                : "Delete role"
          }
          className="p-1 rounded text-red-400 hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
