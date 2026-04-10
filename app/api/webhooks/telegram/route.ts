import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { TelegramUpdate } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  // Bot token is in the URL path as a query param for routing
  const botToken = req.nextUrl.searchParams.get("token");
  if (!botToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const update: TelegramUpdate = await req.json();

  if (!update.message?.text) {
    return NextResponse.json({ ok: true }); // Ignore non-text messages for now
  }

  const msg = update.message;

  try {
    // Find the connection by bot token
    const { data: connection } = await supabase
      .from("connections")
      .select("*")
      .eq("bot_token", botToken)
      .eq("platform", "telegram")
      .single();

    if (!connection) {
      console.error("No connection found for telegram bot token");
      return NextResponse.json({ ok: true });
    }

    const chatId = String(msg.chat.id);
    const chatName = msg.chat.title || msg.chat.first_name || `Chat ${chatId}`;
    const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");

    // Upsert chat
    const { data: chat } = await supabase
      .from("chats")
      .upsert(
        {
          user_id: connection.user_id,
          connection_id: connection.id,
          platform: "telegram",
          platform_chat_id: chatId,
          chat_name: chatName,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        },
        { onConflict: "connection_id,platform_chat_id" }
      )
      .select()
      .single();

    if (!chat) {
      console.error("Failed to upsert chat");
      return NextResponse.json({ ok: true });
    }

    // Increment unread count
    await supabase.rpc("increment_unread", { chat_row_id: chat.id }).catch(() => {
      // RPC may not exist yet, use manual update
      supabase
        .from("chats")
        .update({ unread_count: (chat.unread_count || 0) + 1, last_message_at: new Date().toISOString() })
        .eq("id", chat.id);
    });

    // Insert message
    await supabase.from("messages").insert({
      user_id: connection.user_id,
      connection_id: connection.id,
      chat_id: chat.id,
      platform: "telegram",
      platform_message_id: String(msg.message_id),
      platform_chat_id: chatId,
      chat_name: chatName,
      sender_name: senderName,
      content: msg.text,
      direction: "incoming",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
