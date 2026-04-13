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
    reply_to_message?: { message_id: number };
  };
}
