import { sendTelegramMessage } from "./telegram";
import { sendDiscordMessage } from "./discord";
import { sendSlackMessage } from "./slack";
import type { Platform, Connection } from "./types";

export async function sendMessage(
  connection: Connection,
  chatId: string,
  content: string
): Promise<{ platform_message_id: string }> {
  switch (connection.platform) {
    case "telegram": {
      const result = await sendTelegramMessage(
        connection.bot_token!,
        chatId,
        content
      );
      return { platform_message_id: String(result.result.message_id) };
    }
    case "discord": {
      const result = await sendDiscordMessage(
        connection.bot_token!,
        chatId,
        content
      );
      return { platform_message_id: result.id };
    }
    case "slack": {
      const result = await sendSlackMessage(
        connection.bot_token!,
        chatId,
        content
      );
      return { platform_message_id: result.ts };
    }
    default:
      throw new Error(`Platform ${connection.platform} not supported yet`);
  }
}

export function getPlatformColor(platform: Platform): string {
  switch (platform) {
    case "telegram": return "var(--telegram)";
    case "discord": return "var(--discord)";
    case "slack": return "var(--slack)";
    case "whatsapp": return "var(--whatsapp)";
  }
}

export function getPlatformName(platform: Platform): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}
