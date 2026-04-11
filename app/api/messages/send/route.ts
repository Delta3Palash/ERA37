import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/platforms";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { connectionId, content } = await req.json();

  // Use service client to read connection (bot_token) since RLS limits user access
  const serviceClient = createServiceClient();
  const { data: connection } = await serviceClient
    .from("connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  // Get or create user profile for sender name
  let { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  // Create profile if it doesn't exist (safety net for FK constraint)
  if (!profile) {
    const { data: created } = await serviceClient
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.username || user.email || "User",
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        },
        { onConflict: "id" }
      )
      .select("display_name, avatar_url")
      .single();
    profile = created;
  }

  try {
    // Prefix message with username so recipients on the platform know who sent it
    const senderName = profile?.display_name || "User";
    const platformContent = `[${senderName}] ${content}`;
    const result = await sendMessage(connection, connection.platform_channel_id, platformContent);

    // Save to DB using service client (needs to insert for all users to see)
    const { data: message, error } = await serviceClient
      .from("messages")
      .insert({
        connection_id: connectionId,
        platform: connection.platform,
        platform_message_id: result.platform_message_id,
        platform_channel_id: connection.platform_channel_id,
        sender_name: profile?.display_name || "User",
        sender_avatar: profile?.avatar_url,
        content,
        direction: "outgoing",
        sent_by: user.id,
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
