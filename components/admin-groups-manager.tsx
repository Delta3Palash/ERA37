"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X, Lock } from "lucide-react";
import { TelegramIcon, DiscordIcon, SlackIcon, WhatsAppIcon } from "./platform-icons";
import type { Connection, Role, Platform } from "@/lib/types";

interface GroupRow {
  id: string;
  name: string;
  min_role_priority: number;
  sort_order: number;
  connection_ids: string[];
}

interface Props {
  initialGroups: GroupRow[];
  connections: Connection[];
  roles: Role[];
}

function platformIcon(platform: Platform) {
  switch (platform) {
    case "telegram":
      return <TelegramIcon className="w-4 h-4" />;
    case "discord":
      return <DiscordIcon className="w-4 h-4" />;
    case "slack":
      return <SlackIcon className="w-4 h-4" />;
    case "whatsapp":
      return <WhatsAppIcon className="w-4 h-4" />;
    default:
      return null;
  }
}

export function GroupsManager({ initialGroups, connections, roles }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [minPriority, setMinPriority] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGroup() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          min_role_priority: minPriority,
          connection_ids: selected,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create group");
      }
      setName("");
      setMinPriority(0);
      setSelected([]);
      setCreating(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <section className="bg-surface rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Channel Groups</h2>
          <p className="text-sm text-muted">
            Group connected platforms into rooms with role-gated access. Messages bridge only within a group.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover"
          >
            <Plus className="w-4 h-4" /> New group
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-4 p-4 rounded-lg bg-background border border-border space-y-3">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name (e.g. R4 Officers)"
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent"
            />
            <MinPrioritySelect value={minPriority} onChange={setMinPriority} roles={roles} />
          </div>

          <div>
            <p className="text-xs text-muted mb-1.5">Connections</p>
            <ConnectionCheckboxes
              connections={connections}
              selected={selected}
              onToggle={toggleSelected}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={createGroup}
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

      <div className="space-y-3">
        {initialGroups.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">No groups yet.</p>
        ) : (
          initialGroups.map((g) => (
            <GroupRowView key={g.id} group={g} connections={connections} roles={roles} />
          ))
        )}
      </div>
    </section>
  );
}

function MinPrioritySelect({
  value,
  onChange,
  roles,
}: {
  value: number;
  onChange: (n: number) => void;
  roles: Role[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Lock className="w-4 h-4 text-muted" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-2 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent"
        title="Minimum role priority to access"
      >
        <option value={0}>Anyone (0)</option>
        {roles.map((r) => (
          <option key={r.id} value={r.priority}>
            {r.name} ({r.priority})
          </option>
        ))}
      </select>
    </div>
  );
}

function ConnectionCheckboxes({
  connections,
  selected,
  onToggle,
}: {
  connections: Connection[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (connections.length === 0) {
    return (
      <p className="text-xs text-muted italic">
        No connections yet — add channels in the Channels tab first.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {connections.map((c) => {
        const active = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
              active
                ? "bg-accent/20 border-accent text-accent"
                : "bg-surface border-border text-muted hover:bg-surface-hover"
            }`}
          >
            <span className={`platform-${c.platform}`}>{platformIcon(c.platform)}</span>
            <span className="truncate max-w-[160px]">{c.channel_name || c.platform}</span>
          </button>
        );
      })}
    </div>
  );
}

function GroupRowView({
  group,
  connections,
  roles,
}: {
  group: GroupRow;
  connections: Connection[];
  roles: Role[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [minPriority, setMinPriority] = useState(group.min_role_priority);
  const [selected, setSelected] = useState<string[]>(group.connection_ids);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const putRes = await fetch(`/api/admin/groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, min_role_priority: minPriority }),
      });
      if (!putRes.ok) {
        const data = await putRes.json();
        throw new Error(data.error || "Failed to update group");
      }

      const toAdd = selected.filter((id) => !group.connection_ids.includes(id));
      const toRemove = group.connection_ids.filter((id) => !selected.includes(id));

      for (const id of toAdd) {
        await fetch(`/api/admin/groups/${group.id}/connections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: id }),
        });
      }
      for (const id of toRemove) {
        await fetch(`/api/admin/groups/${group.id}/connections?connectionId=${id}`, {
          method: "DELETE",
        });
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
    if (!confirm(`Delete group "${group.name}"? Connections are not deleted.`)) return;
    const res = await fetch(`/api/admin/groups/${group.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to delete");
      return;
    }
    router.refresh();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const groupConnections = connections.filter((c) => group.connection_ids.includes(c.id));

  if (editing) {
    return (
      <div className="p-4 rounded-lg bg-background border border-border space-y-3">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground"
          />
          <MinPrioritySelect value={minPriority} onChange={setMinPriority} roles={roles} />
        </div>
        <div>
          <p className="text-xs text-muted mb-1.5">Connections</p>
          <ConnectionCheckboxes
            connections={connections}
            selected={selected}
            onToggle={toggleSelected}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "..." : "Save"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setName(group.name);
              setMinPriority(group.min_role_priority);
              setSelected(group.connection_ids);
            }}
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
    <div className="p-4 rounded-lg bg-background border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{group.name}</span>
          {group.min_role_priority > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted">
              <Lock className="w-3 h-3" /> min priority {group.min_role_priority}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(true)} className="text-xs text-accent hover:underline">
            Edit
          </button>
          <button
            onClick={remove}
            className="p-1 rounded text-red-400 hover:bg-red-900/20"
            title="Delete group"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {groupConnections.length === 0 ? (
        <p className="text-xs text-muted italic">No connections</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {groupConnections.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface text-xs text-muted"
            >
              <span className={`platform-${c.platform}`}>{platformIcon(c.platform)}</span>
              {c.channel_name || c.platform}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
