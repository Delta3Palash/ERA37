import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "chat-images";

/**
 * Re-host a binary blob (e.g. a Telegram GIF) into Supabase Storage and
 * return a public URL. Used to avoid leaking bot tokens in api.telegram.org
 * URLs when bridging media across platforms.
 */
export async function rehostBytes(
  bytes: ArrayBuffer,
  filename: string,
  contentType: string
): Promise<string | null> {
  const svc = createServiceClient();

  // Namespace by source so re-hosted incoming media is grouped separately
  // from user uploads in the same bucket.
  const ext = (filename.split(".").pop() || "bin").toLowerCase();
  const path = `incoming/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await svc.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    console.error("Rehost upload failed:", error.message);
    return null;
  }

  const { data } = svc.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
