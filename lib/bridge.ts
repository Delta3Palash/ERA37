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

  // Get all OTHER connections
  const { data: allConnections } = await supabase
    .from("connections")
    .select("*")
    .neq("id", sourceConnection.id);

  if (!allConnections?.length) return;

  const platformName = sourceConnection.platform.charAt(0).toUpperCase() + sourceConnection.platform.slice(1);
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
