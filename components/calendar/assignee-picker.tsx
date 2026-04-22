"use client";

import { useEffect, useState } from "react";

export interface Assignee {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  value: string | null;
  onChange: (assigneeId: string | null) => void;
  disabled?: boolean;
}

/**
 * Select menu backed by GET /api/calendar/assignees. The endpoint returns
 * every profile eligible to lead an event (anyone with can_manage=true OR
 * is_admin=true). The blank option means "unassigned".
 */
export function AssigneePicker({ value, onChange, disabled }: Props) {
  const [options, setOptions] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/calendar/assignees");
        if (res.ok) {
          const data: Assignee[] = await res.json();
          setOptions(data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled || loading}
      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-accent"
    >
      <option value="">— Unassigned —</option>
      {options.map((a) => (
        <option key={a.id} value={a.id}>
          {a.display_name || "(no name)"}
        </option>
      ))}
    </select>
  );
}
