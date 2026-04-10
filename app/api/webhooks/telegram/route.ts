import { createServiceClient } from "@/lib/supabase/server";
import { getTelegramFileUrl } from "@/lib/telegram";
import { NextRequest, NextResponse } from "next/server";
import type { TelegramUpdate } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  const botToken = req.nextUrl.searchParams.get("token");
  if (!botToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const update: TelegramUpdate = await req.json();

  if (!update.message) {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  const hasText = !!msg.text || !!msg.caption;
  const hasPhoto = !!msg.photo && msg.photo.length > 0;

  if (!hasText && !hasPhoto) {
    return NextResponse.json({ ok: true });
  }

  try {
    // Find the connection by bot token and verify it's for this specific chat
    const { data: connection } = await supabase
      .from("connections")
      .select("*")
      .eq("bot_token", botToken)
      .eq("platform", "telegram")
      .eq("platform_channel_id", String(msg.chat.id))
      .single();

    if (!connection) {
      // Message is from a chat we're not tracking — ignore
      return NextResponse.json({ ok: true });
    }

    const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");

    // Get image URL if photo
    let imageUrl: string | null = null;
    if (hasPhoto) {
      const largestPhoto = msg.photo![msg.photo!.length - 1];
      imageUrl = await getTelegramFileUrl(botToken, largestPhoto.file_id);
    }

    await supabase.from("messages").insert({
      connection_id: connection.id,
      platform: "telegram",
      platform_message_id: String(msg.message_id),
      platform_channel_id: String(msg.chat.id),
      sender_name: senderName,
      content: msg.text || msg.caption || null,
      image_url: imageUrl,
      direction: "incoming",
      message_type: hasPhoto ? "image" : "text",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}
