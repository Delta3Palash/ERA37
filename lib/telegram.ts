const TELEGRAM_API = "https://api.telegram.org/bot";

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
) {
  const res = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
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

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; last_name?: string; username?: string };
    chat: { id: number; title?: string; type: string; first_name?: string };
    date: number;
    text?: string;
  };
}
