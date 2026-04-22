import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/platforms";
import type { CalendarEvent, CalendarKind, Connection } from "@/lib/types";

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

  // Also post a public announcement into the alliance chat when someone
  // becomes the new owner. Only fires for *new* assignments (not for the
  // displaced user) — the alliance doesn't need a "you're off this" ping.
  if (newAssigneeId && newAssigneeId !== oldAssigneeId) {
    await broadcastAssignmentToAlliance(svc, event, newAssigneeId);
  }
}

/**
 * Post a single-line announcement to every connection in the alliance-wide
 * channel group (the group with min_role_priority=0 — i.e. "everyone can
 * read it"). Used when a new owner is assigned to a calendar event so the
 * whole alliance sees "🔔 Dermy — leading Treasure Hunt at 14:00 UTC" in
 * chat without anyone having to retype it.
 *
 * Failures are logged and swallowed — a chat outage should never block the
 * assignment itself. Also logs one `messages` row per target so the post
 * shows up in the in-app chat history alongside everything else.
 */
async function broadcastAssignmentToAlliance(
  svc: SupabaseClient,
  event: CalendarEvent,
  assigneeId: string
): Promise<void> {
  // Look up the assignee's display name. We can't rely on the event's
  // embedded `assignee` join — the POST/PATCH routes only populate it
  // shaped as an array and it may be missing entirely on older call sites.
  const { data: profile } = await svc
    .from("profiles")
    .select("display_name")
    .eq("id", assigneeId)
    .single();
  const displayName = profile?.display_name?.trim() || "Someone";

  // Pick the broadcast group(s): any channel group visible to "everyone"
  // (min_role_priority=0). Usually a single "General" group, but if an
  // admin has multiple zero-priority groups we hit them all so nothing is
  // silently missed.
  const { data: groups } = await svc
    .from("channel_groups")
    .select("id")
    .eq("min_role_priority", 0);
  const groupIds = (groups || []).map((g: { id: string }) => g.id);
  if (groupIds.length === 0) return;

  const { data: links } = await svc
    .from("channel_group_connections")
    .select("connection_id")
    .in("group_id", groupIds);
  const connIds = Array.from(
    new Set((links || []).map((l: { connection_id: string }) => l.connection_id))
  );
  if (connIds.length === 0) return;

  const { data: connections } = await svc
    .from("connections")
    .select("*")
    .in("id", connIds);
  if (!connections?.length) return;

  const content = buildAssignmentAnnouncement(event, displayName);

  await Promise.allSettled(
    (connections as Connection[]).map(async (conn) => {
      try {
        const result = await sendMessage(conn, conn.platform_channel_id, content);
        const { error: insertError } = await svc.from("messages").insert({
          connection_id: conn.id,
          platform: conn.platform,
          platform_message_id: result.platform_message_id,
          platform_channel_id: conn.platform_channel_id,
          sender_name: "ERA37",
          content,
          direction: "outgoing",
          message_type: "text",
          metadata: {
            system: true,
            reason: "event_assignment",
            event_id: event.id,
          },
        });
        if (insertError) {
          console.error("[notifications] alliance-broadcast insert failed:", {
            code: insertError.code,
            message: insertError.message,
            connection_id: conn.id,
            event_id: event.id,
          });
        }
      } catch (err) {
        console.error(
          `[notifications] alliance-broadcast to ${conn.platform} failed:`,
          err
        );
      }
    })
  );
}

/** "🔔 Dermy — leading Treasure Hunt at 14:00 UTC" (adds a weekday prefix
 *  when the event isn't today so recipients aren't confused by times that
 *  have already passed). */
function buildAssignmentAnnouncement(event: CalendarEvent, displayName: string): string {
  const d = new Date(event.starts_at);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const now = new Date();
  const sameUtcDay =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate();
  const whenLabel = sameUtcDay
    ? `${hh}:${mm} UTC`
    : `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${hh}:${mm} UTC`;
  return `🔔 ${displayName} — leading ${event.title} at ${whenLabel}`;
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
