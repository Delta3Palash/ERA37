import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/platforms";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { connectionId, connectionIds, content, imageUrl, replyToMessageId } = await req.json();

  const serviceClient = createServiceClient();

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
  const platformContent = content
    ? `[${senderName}] ${content}`
    : imageUrl
      ? `[${senderName}]\n${imageUrl}`
      : `[${senderName}]`;

  // Look up parent message's platform_message_id for native replies
  let replyPlatformIds: Map<string, string> | null = null;
  if (replyToMessageId) {
    const { data: parentMessages } = await serviceClient
      .from("messages")
      .select("connection_id, platform_message_id")
      .eq("reply_to_message_id", replyToMessageId)
      .is("platform_message_id", "not.null");

    // Also get the original message itself (it might be the one with the platform IDs)
    const { data: original } = await serviceClient
      .from("messages")
      .select("connection_id, platform_message_id")
      .eq("id", replyToMessageId)
      .single();

    replyPlatformIds = new Map();
    if (original?.platform_message_id) {
      replyPlatformIds.set(original.connection_id, original.platform_message_id);
    }
    if (parentMessages) {
      for (const pm of parentMessages) {
        if (pm.platform_message_id) {
          replyPlatformIds.set(pm.connection_id, pm.platform_message_id);
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
