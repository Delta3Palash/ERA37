import { createServiceClient } from "@/lib/supabase/server";
import { getTelegramFileUrl } from "@/lib/telegram";
import { bridgeMessage } from "@/lib/bridge";
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

  // GIFs from Telegram's native keyboard come as `animation` (mp4), generic
  // uploads as `document`, videos as `video`, stickers as `sticker`. All of
  // these need to pass through, not just plain photos.
  const mediaFileId =
    (msg.photo && msg.photo[msg.photo.length - 1]?.file_id) ||
    msg.animation?.file_id ||
    msg.video?.file_id ||
    msg.video_note?.file_id ||
    msg.document?.file_id ||
    (msg.sticker && (msg.sticker.is_video || msg.sticker.is_animated)
      ? msg.sticker.file_id
      : undefined) ||
    null;
  const hasMedia = !!mediaFileId;

  if (!hasText && !hasMedia) {
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

    // Skip messages from bots (prevents bridge loops)
    if (msg.from?.is_bot) {
      return NextResponse.json({ ok: true });
    }

    const senderName = msg.from.username || msg.from.first_name;

    // Resolve a downloadable URL for whichever media type was present.
    let imageUrl: string | null = null;
    if (mediaFileId) {
      imageUrl = await getTelegramFileUrl(botToken, mediaFileId);
    }

    // Resolve reply reference
    let replyToId: string | null = null;
    if (msg.reply_to_message?.message_id) {
      const { data: parent } = await supabase
        .from("messages")
        .select("id")
        .eq("platform_message_id", String(msg.reply_to_message.message_id))
        .eq("connection_id", connection.id)
        .single();
      if (parent) replyToId = parent.id;
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
      message_type: hasMedia ? "image" : "text",
      reply_to_message_id: replyToId,
    });

    // Bridge to other platforms (separate try-catch)
    try {
      await bridgeMessage(
        connection,
        senderName,
        msg.text || msg.caption || null,
        imageUrl,
        String(msg.message_id)
      );
    } catch (bridgeErr) {
      console.error("Telegram bridge error:", bridgeErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}
