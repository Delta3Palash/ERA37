import { sendTelegramMessage } from "./telegram";
import { sendDiscordMessage } from "./discord";
import { sendSlackMessage } from "./slack";
import { sendWhatsAppMessage } from "./whatsapp";
import type { Platform, Connection } from "./types";

export interface SendOptions {
  replyToPlatformId?: string | null;
  /**
   * URL to a still image, GIF, or video attached to the message. When set,
   * callers should pass it as an option instead of splicing it into `content`
   * — each platform sender decides how to attach it natively:
   *
   *  - Discord: embed (`embeds[0].image.url`) so the URL never shows as text
   *  - Telegram/Slack/WhatsApp: appended on a new line after content so the
   *    platform auto-previews it
   */
  imageUrl?: string | null;
}

export async function sendMessage(
  connection: Connection,
  channelId: string,
  content: string,
  options: SendOptions = {}
): Promise<{ platform_message_id: string }> {
  const { replyToPlatformId, imageUrl } = options;

  switch (connection.platform) {
    case "telegram": {
      // Telegram auto-previews URLs in text; keep the URL in the text body.
      const textWithUrl = imageUrl ? `${content}\n${imageUrl}` : content;
      const result = await sendTelegramMessage(
        connection.bot_token!,
        channelId,
        textWithUrl,
        replyToPlatformId
      );
      return { platform_message_id: String(result.result.message_id) };
    }
    case "discord": {
      // Discord gets the URL via an embed so the raw URL never renders as
      // text next to the sender name.
      const result = await sendDiscordMessage(
        connection.bot_token!,
        channelId,
        content,
        replyToPlatformId,
        imageUrl
      );
      return { platform_message_id: result.id };
    }
    case "slack": {
      const textWithUrl = imageUrl ? `${content}\n${imageUrl}` : content;
      const result = await sendSlackMessage(
        connection.bot_token!,
        channelId,
        textWithUrl,
        replyToPlatformId
      );
      return { platform_message_id: result.ts };
    }
    case "whatsapp": {
      const phoneNumberId = (connection.metadata as any).phone_number_id;
      const accessToken = connection.bot_token!;
      const textWithUrl = imageUrl ? `${content}\n${imageUrl}` : content;
      const result = await sendWhatsAppMessage(
        phoneNumberId,
        accessToken,
        channelId,
        textWithUrl,
        replyToPlatformId
      );
      return { platform_message_id: result.messages[0].id };
    }
    default:
      throw new Error(`Platform ${connection.platform} not supported yet`);
  }
}

export function getPlatformName(platform: Platform): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}
