import { createServiceClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/platforms";
import type { Connection } from "@/lib/types";

export async function bridgeMessage(
  sourceConnection: Connection,
  senderName: string,
  content: string | null,
  imageUrl: string | null,
  platformMessageId: string | null
): Promise<void> {
  if (!content && !imageUrl) return;

  const supabase = createServiceClient();

  // Check if bridging is enabled
  const { data: workspace, error: wsError } = await supabase
    .from("workspace")
    .select("bridge_enabled")
    .single();

  if (wsError) {
    console.error("Bridge: workspace query failed:", wsError.message);
    return;
  }

  if (!workspace?.bridge_enabled) return;

  // Find which channel_groups the source connection belongs to
  const { data: sourceLinks } = await supabase
    .from("channel_group_connections")
    .select("group_id")
    .eq("connection_id", sourceConnection.id);

  const groupIds = (sourceLinks || []).map((l: { group_id: string }) => l.group_id);
  if (groupIds.length === 0) {
    // Defensive: post-migration every connection is in General. If we hit this,
    // a connection was added out-of-band — skip bridging rather than leak.
    console.warn(
      `Bridge: source connection ${sourceConnection.id} has no channel_group — skipping`
    );
    return;
  }

  // All connections that share a group with the source (excluding source)
  const { data: siblingLinks } = await supabase
    .from("channel_group_connections")
    .select("connection_id")
    .in("group_id", groupIds);

  const targetIds = Array.from(
    new Set(
      (siblingLinks || [])
        .map((l: { connection_id: string }) => l.connection_id)
        .filter((id: string) => id !== sourceConnection.id)
    )
  );

  if (targetIds.length === 0) return;

  const { data: allConnections } = await supabase
    .from("connections")
    .select("*")
    .in("id", targetIds);

  if (!allConnections?.length) return;

  const platformName =
    sourceConnection.platform.charAt(0).toUpperCase() + sourceConnection.platform.slice(1);
  const bridgedContent = `[${platformName}] ${senderName}: ${content || ""}`.trim();

  await Promise.allSettled(
    allConnections.map(async (targetConn: Connection) => {
      try {
        const result = await sendMessage(
          targetConn,
          targetConn.platform_channel_id,
          bridgedContent
        );

        await supabase.from("messages").insert({
          connection_id: targetConn.id,
          platform: targetConn.platform,
          platform_message_id: result.platform_message_id,
          platform_channel_id: targetConn.platform_channel_id,
          sender_name: senderName,
          content,
          image_url: imageUrl,
          direction: "bridged",
          message_type: imageUrl ? "image" : "text",
          metadata: {
            bridged: true,
            source_platform: sourceConnection.platform,
            source_connection_id: sourceConnection.id,
            source_message_id: platformMessageId,
          },
        });
      } catch (err) {
        console.error(`Bridge to ${targetConn.platform} failed:`, err);
      }
    })
  );
}
