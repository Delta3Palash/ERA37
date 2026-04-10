import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// This endpoint receives messages from the Discord worker (Railway)
// The worker pushes messages here via HTTP POST
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  const authHeader = req.headers.get("authorization");
  const expectedToken = process.env.DISCORD_WEBHOOK_SECRET || process.env.DISCORD_BOT_TOKEN;

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    userId,
    connectionId,
    channelId,
    channelName,
    guildName,
    senderName,
    content,
    messageId,
  } = await req.json();

  if (!userId || !connectionId || !content) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const chatName = guildName ? `${guildName} / #${channelName}` : `#${channelName}`;

    // Upsert chat
    const { data: chat } = await supabase
      .from("chats")
      .upsert(
        {
          user_id: userId,
          connection_id: connectionId,
          platform: "discord",
          platform_chat_id: channelId,
          chat_name: chatName,
          last_message_at: new Date().toISOString(),
        },
        { onConflict: "connection_id,platform_chat_id" }
      )
      .select()
      .single();

    if (!chat) {
      return NextResponse.json({ error: "Failed to upsert chat" }, { status: 500 });
    }

    // Update unread
    await supabase
      .from("chats")
      .update({
        unread_count: (chat.unread_count || 0) + 1,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", chat.id);

    // Insert message
    await supabase.from("messages").insert({
      user_id: userId,
      connection_id: connectionId,
      chat_id: chat.id,
      platform: "discord",
      platform_message_id: messageId,
      platform_chat_id: channelId,
      chat_name: chatName,
      sender_name: senderName,
      content,
      direction: "incoming",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Discord webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
