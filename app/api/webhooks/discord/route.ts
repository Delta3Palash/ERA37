import { createServiceClient } from "@/lib/supabase/server";
import { bridgeMessage } from "@/lib/bridge";
import { NextRequest, NextResponse } from "next/server";

// Receives messages from the Discord worker (Railway)
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  const authHeader = req.headers.get("authorization");
  const expectedToken = process.env.DISCORD_WEBHOOK_SECRET || process.env.DISCORD_BOT_TOKEN;

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    connectionId,
    channelId,
    senderName,
    senderAvatar,
    content,
    imageUrl,
    messageId,
    skipInsert,
  } = await req.json();

  if (!connectionId || (!content && !imageUrl)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Insert message first — skip if already written directly by the worker
  if (!skipInsert) {
    try {
      await supabase.from("messages").insert({
        connection_id: connectionId,
        platform: "discord",
        platform_message_id: messageId,
        platform_channel_id: channelId,
        sender_name: senderName,
        sender_avatar: senderAvatar,
        content: content || null,
        image_url: imageUrl || null,
        direction: "incoming",
        message_type: imageUrl ? "image" : "text",
      });
    } catch (err: any) {
      console.error("Discord message insert error:", err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // Bridge to other platforms (separate try-catch — must not break the webhook)
  try {
    const { data: connection } = await supabase
      .from("connections")
      .select("*")
      .eq("id", connectionId)
      .single();

    if (connection) {
      await bridgeMessage(connection, senderName, content || null, imageUrl || null, messageId);
    }
  } catch (err: any) {
    console.error("Discord bridge error:", err);
  }

  return NextResponse.json({ ok: true });
}
