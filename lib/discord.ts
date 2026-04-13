const DISCORD_API = "https://discord.com/api/v10";

export async function sendDiscordMessage(
  botToken: string,
  channelId: string,
  content: string,
  replyToMessageId?: string | null
) {
  const body: any = { content };
  if (replyToMessageId) {
    body.message_reference = { message_id: replyToMessageId };
  }
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord API error: ${err}`);
  }
  return res.json();
}

export function getDiscordOAuthUrl(clientId: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "bot",
    permissions: "68608", // Read messages + Send messages + Read message history
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}
