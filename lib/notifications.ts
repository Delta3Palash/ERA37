import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent, CalendarKind } from "@/lib/types";

/**
 * Fire the in-app notifications that should result from a calendar_event's
 * assignment state changing. Called by the POST (create) and PATCH (update)
 * routes on /api/calendar/events.
 *
 * Rules (mirrors the user's config — only-assignee recipient, on-assignment
 * trigger):
 *   - If `newAssigneeId` is set and differs from the actor, insert an
 *     `event_assigned` row for that user.
 *   - If `oldAssigneeId` is set AND differs from the new assignee, insert
 *     an `event_unassigned` row for the displaced user.
 *   - Never notify the actor about their own action (e.g. an R5 assigning
 *     themselves shouldn't self-ping).
 *
 * Errors are logged but never thrown — a notification failure must not roll
 * back the event save. The caller passes its own service client so we don't
 * spin up a new one per call.
 */
export async function notifyAssignmentChange(
  svc: SupabaseClient,
  opts: {
    event: CalendarEvent;
    oldAssigneeId: string | null;
    newAssigneeId: string | null;
    actorId: string;
  }
): Promise<void> {
  const { event, oldAssigneeId, newAssigneeId, actorId } = opts;
  if (oldAssigneeId === newAssigneeId) return;

  const linkHref = `/calendar/${event.kind}`;
  const whenLabel = formatUtcLabel(event.starts_at);
  const rows: Array<{
    recipient_id: string;
    kind: "event_assigned" | "event_unassigned";
    event_id: string;
    title: string;
    body: string;
    link_href: string;
  }> = [];

  if (newAssigneeId && newAssigneeId !== actorId) {
    rows.push({
      recipient_id: newAssigneeId,
      kind: "event_assigned",
      event_id: event.id,
      title: `You're on: ${event.title}`,
      body: `${kindLabel(event.kind)} · ${whenLabel} UTC${
        event.event_type ? ` · ${event.event_type}` : ""
      }`,
      link_href: linkHref,
    });
  }
  if (oldAssigneeId && oldAssigneeId !== newAssigneeId && oldAssigneeId !== actorId) {
    rows.push({
      recipient_id: oldAssigneeId,
      kind: "event_unassigned",
      event_id: event.id,
      title: `Removed from: ${event.title}`,
      body: `${kindLabel(event.kind)} · ${whenLabel} UTC · you've been reassigned`,
      link_href: linkHref,
    });
  }
  if (rows.length === 0) return;

  const { error } = await svc.from("notifications").insert(rows);
  if (error) {
    console.error("[notifications] insert failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      event_id: event.id,
    });
  }
}

function kindLabel(k: CalendarKind): string {
  return k === "game" ? "Game" : k === "misc" ? "Task" : "Alliance";
}

/** Compact UTC label like "Wed Apr 23 14:00". */
function formatUtcLabel(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  const month = d.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${weekday} ${month} ${day} ${hh}:${mm}`;
}
