import crypto from "crypto";

const WHATSAPP_API = "https://graph.facebook.com/v21.0";

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientId: string,
  content: string,
  replyToMessageId?: string | null
): Promise<{ messages: Array<{ id: string }> }> {
  const body: any = {
    messaging_product: "whatsapp",
    to: recipientId,
    type: "text",
    text: { body: content },
  };
  if (replyToMessageId) {
    body.context = { message_id: replyToMessageId };
  }
  const res = await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp send error: ${err}`);
  }

  return res.json();
}

export async function getWhatsAppPhoneInfo(
  phoneNumberId: string,
  accessToken: string
): Promise<any> {
  const res = await fetch(`${WHATSAPP_API}/${phoneNumberId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp verification error: ${err}`);
  }

  return res.json();
}

export function verifyWhatsAppSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string
): boolean {
  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const providedSig = signatureHeader.replace("sha256=", "");

  if (expectedSig.length !== providedSig.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expectedSig),
    Buffer.from(providedSig)
  );
}

export async function getWhatsAppMediaUrl(
  mediaId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(`${WHATSAPP_API}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}
