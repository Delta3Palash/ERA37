import { createClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/platforms";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chatId, connectionId, platformChatId, platform, content } = await req.json();

  // Get connection with bot token
  const { data: connection } = await supabase
    .from("connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single();

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    // Send to platform
    const result = await sendMessage(connection, platformChatId, content);

    // Save to DB
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        user_id: user.id,
        connection_id: connectionId,
        chat_id: chatId,
        platform,
        platform_message_id: result.platform_message_id,
        platform_chat_id: platformChatId,
        sender_name: "You",
        content,
        direction: "outgoing",
      })
      .select()
      .single();

    if (error) throw error;

    // Update chat last_message_at
    await supabase
      .from("chats")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", chatId);

    return NextResponse.json(message);
  } catch (err: any) {
    console.error("Send message error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
