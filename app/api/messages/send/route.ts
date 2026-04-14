import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/platforms";
import { NextRequest, NextResponse } from "next/server";
import { effectivePriority, type Role } from "@/lib/types";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { connectionId, connectionIds, content, imageUrl, replyToMessageId } = await req.json();

  const serviceClient = createServiceClient();

  // ------------------------------------------------------------------
  // Access check: every target connection must belong to a channel_group
  // whose min_role_priority the sender satisfies. Uses service client so
  // we can read channel_group_connections even if RLS gets tightened later.
  // ------------------------------------------------------------------
  const targetIds: string[] = Array.isArray(connectionIds)
    ? connectionIds
    : connectionId
    ? [connectionId]
    : [];

  if (targetIds.length === 0) {
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });
  }

  const { data: senderAssignments } = await serviceClient
    .from("profile_roles")
    .select("roles(*)")
    .eq("profile_id", user.id);
  const senderRoles: Role[] = (senderAssignments || [])
    .map((r: any) => r.roles as Role)
    .filter(Boolean);
  const userPriority = effectivePriority(senderRoles);

  const { data: groupLinks } = await serviceClient
    .from("channel_group_connections")
    .select("connection_id, channel_groups(min_role_priority)")
    .in("connection_id", targetIds);

  // For each target, compute the lowest min_role_priority across its groups.
  // If a target has no group rows at all, we treat it as inaccessible (defense in depth).
  const minByConn = new Map<string, number>();
  for (const link of (groupLinks || []) as any[]) {
    const min = link.channel_groups?.min_role_priority ?? Number.POSITIVE_INFINITY;
    const prev = minByConn.get(link.connection_id);
    if (prev === undefined || min < prev) minByConn.set(link.connection_id, min);
  }
  for (const id of targetIds) {
    if (!minByConn.has(id)) {
      return NextResponse.json(
        { error: "Connection is not in any channel group" },
        { status: 403 }
      );
    }
    const required = minByConn.get(id) as number;
    if (userPriority < required) {
      return NextResponse.json(
        { error: "You don't have access to this channel" },
        { status: 403 }
      );
    }
  }

  // Get or create user profile for sender name
  let { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) {
    const { data: created } = await serviceClient
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: user.user_metadata?.custom_claims?.global_name || user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.username || user.email || "User",
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        },
        { onConflict: "id" }
      )
      .select("display_name, avatar_url")
      .single();
    profile = created;
  }

  const senderName = profile?.display_name || "User";
  const hasCaption = typeof content === "string" && content.trim().length > 0;
  let platformContent = `[${senderName}]`;
  if (hasCaption) platformContent += ` ${content}`;
  if (imageUrl) {
    if (hasCaption) {
      // Caption + image: keep URL on a new line (preserves commit 96570d1 — we need
      // the URL in the text for platforms that don't auto-embed).
      platformContent += `\n${imageUrl}`;
    } else {
      // Image only (e.g. Klipy GIF with no caption): use a markdown hidden link
      // with a zero-width space as the visible text. Discord still auto-embeds
      // the URL but the link text is invisible, so the raw URL doesn't show up
      // above the embed.
      platformContent += ` [\u200B](${imageUrl})`;
    }
  }

  // Look up parent message's platform_message_id for native replies
  let replyPlatformIds: Map<string, string> | null = null;
  if (replyToMessageId) {
    // Get the parent message first
    const { data: original } = await serviceClient
      .from("messages")
      .select("id, connection_id, platform_message_id, content, sent_by, created_at")
      .eq("id", replyToMessageId)
      .single();

    replyPlatformIds = new Map();
    if (original?.platform_message_id) {
      replyPlatformIds.set(original.connection_id, original.platform_message_id);
    }

    // For "Send to All" outgoing messages, find sibling messages on other connections
    // (same sender, same content, within 5s — these are the same logical message)
    if (original?.sent_by && original?.content) {
      const { data: siblings } = await serviceClient
        .from("messages")
        .select("connection_id, platform_message_id")
        .eq("sent_by", original.sent_by)
        .eq("content", original.content)
        .eq("direction", "outgoing")
        .not("platform_message_id", "is", null)
        .gte("created_at", new Date(new Date(original.created_at).getTime() - 5000).toISOString())
        .lte("created_at", new Date(new Date(original.created_at).getTime() + 5000).toISOString());

      if (siblings) {
        for (const s of siblings) {
          if (s.platform_message_id) {
            replyPlatformIds.set(s.connection_id, s.platform_message_id);
          }
        }
      }
    }

    // Also check for bridged copies of incoming messages on other connections
    if (original && !original.sent_by) {
      const { data: bridged } = await serviceClient
        .from("messages")
        .select("connection_id, platform_message_id")
        .eq("direction", "bridged")
        .not("platform_message_id", "is", null)
        .gte("created_at", new Date(new Date(original.created_at).getTime() - 5000).toISOString())
        .lte("created_at", new Date(new Date(original.created_at).getTime() + 5000).toISOString());

      if (bridged) {
        for (const b of bridged) {
          if (b.platform_message_id) {
            replyPlatformIds.set(b.connection_id, b.platform_message_id);
          }
        }
      }
    }
  }

  // Batch send: connectionIds array
  if (connectionIds && Array.isArray(connectionIds)) {
    const { data: connections } = await serviceClient
      .from("connections")
      .select("*")
      .in("id", connectionIds);

    if (!connections?.length) {
      return NextResponse.json({ error: "No connections found" }, { status: 404 });
    }

    const results = await Promise.allSettled(
      connections.map(async (conn: any) => {
        const replyToPlatformId = replyPlatformIds?.get(conn.id) || null;
        const result = await sendMessage(conn, conn.platform_channel_id, platformContent, replyToPlatformId);

        const { data: message, error } = await serviceClient
          .from("messages")
          .insert({
            connection_id: conn.id,
            platform: conn.platform,
            platform_message_id: result.platform_message_id,
            platform_channel_id: conn.platform_channel_id,
            sender_name: senderName,
            sender_avatar: profile?.avatar_url,
            content: content || null,
            image_url: imageUrl || null,
            direction: "outgoing",
            sent_by: user.id,
            message_type: imageUrl ? "image" : "text",
            reply_to_message_id: replyToMessageId || null,
          })
          .select()
          .single();

        if (error) throw error;
        return message;
      })
    );

    const succeeded = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .map((r) => r.value);
    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r, i) => ({ connection: connections[i]?.platform, error: r.reason?.message }));

    if (failed.length) {
      console.error("Partial send failures:", failed);
    }

    return NextResponse.json({ messages: succeeded, failed });
  }

  // Single send: connectionId (existing behavior)
  const { data: connection } = await serviceClient
    .from("connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    const replyToPlatformId = replyPlatformIds?.get(connectionId) || null;
    const result = await sendMessage(connection, connection.platform_channel_id, platformContent, replyToPlatformId);

    const { data: message, error } = await serviceClient
      .from("messages")
      .insert({
        connection_id: connectionId,
        platform: connection.platform,
        platform_message_id: result.platform_message_id,
        platform_channel_id: connection.platform_channel_id,
        sender_name: senderName,
        sender_avatar: profile?.avatar_url,
        content: content || null,
        image_url: imageUrl || null,
        direction: "outgoing",
        sent_by: user.id,
        message_type: imageUrl ? "image" : "text",
        reply_to_message_id: replyToMessageId || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(message);
  } catch (err: any) {
    console.error("Send message error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
