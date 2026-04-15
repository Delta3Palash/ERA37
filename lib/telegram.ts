const TELEGRAM_API = "https://api.telegram.org/bot";

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  replyToMessageId?: string | null
) {
  const body: any = { chat_id: chatId, text };
  if (replyToMessageId) {
    body.reply_parameters = { message_id: Number(replyToMessageId) };
  }
  const res = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
  return res.json();
}

export async function setTelegramWebhook(botToken: string, webhookUrl: string) {
  const res = await fetch(`${TELEGRAM_API}${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram webhook error: ${err}`);
  }
  return res.json();
}

export async function getTelegramBotInfo(botToken: string) {
  const res = await fetch(`${TELEGRAM_API}${botToken}/getMe`);
  if (!res.ok) throw new Error("Invalid bot token");
  return res.json();
}

/**
 * Resolve a Telegram `file_id` into a downloadable URL. WARNING: the raw
 * URL returned by Telegram contains the bot token in the path
 * (`https://api.telegram.org/file/bot{TOKEN}/...`). DO NOT expose this URL
 * to end users or other platforms — it leaks the bot token. Use
 * `downloadTelegramFile` instead when you need bytes for re-hosting.
 */
export async function getTelegramFileUrl(botToken: string, fileId: string): Promise<string | null> {
  try {
    const res = await fetch(`${TELEGRAM_API}${botToken}/getFile?file_id=${fileId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.result?.file_path) {
      return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
    }
  } catch {}
  return null;
}

/**
 * Fetch a Telegram file and return the raw bytes + a safe filename. The
 * returned URL containing the bot token is only used for the one-shot
 * download inside this function — it never leaves the server.
 */
export async function downloadTelegramFile(
  botToken: string,
  fileId: string
): Promise<{ bytes: ArrayBuffer; filename: string; contentType: string } | null> {
  const privateUrl = await getTelegramFileUrl(botToken, fileId);
  if (!privateUrl) return null;

  const res = await fetch(privateUrl);
  if (!res.ok) return null;

  const bytes = await res.arrayBuffer();
  // Telegram file paths look like "animations/file_0.mp4" or "photos/file_123.jpg"
  const pathname = privateUrl.split("/").slice(-2).join("/");
  const filename = pathname.split("/").pop() || "file";
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { bytes, filename, contentType };
}

interface TelegramFileMeta {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; last_name?: string; username?: string; is_bot?: boolean };
    chat: { id: number; title?: string; type: string; first_name?: string };
    date: number;
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number }>;
    // GIFs sent from Telegram's native GIF picker arrive as `animation`
    // (Telegram transcodes them to mp4). Regular videos come as `video`.
    // Generic files (user-uploaded .gif / .mp4 / etc.) come as `document`.
    // Animated stickers come as `sticker` with `is_animated` / `is_video`.
    animation?: TelegramFileMeta;
    video?: TelegramFileMeta;
    video_note?: TelegramFileMeta;
    document?: TelegramFileMeta;
    sticker?: TelegramFileMeta & { is_animated?: boolean; is_video?: boolean };
    reply_to_message?: { message_id: number };
  };
}
