import { createClient } from "@/lib/supabase/server";
import { translateText, TranslateError } from "@/lib/translate";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

function cacheKey(text: string, targetLanguage: string): string {
  return createHash("sha256")
    .update(text + "|" + targetLanguage)
    .digest("hex")
    .slice(0, 32);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId, text, targetLanguage } = await req.json();

  if (!text || !targetLanguage) {
    return NextResponse.json({ error: "Missing text or targetLanguage" }, { status: 400 });
  }

  const normalized = String(text).trim();
  if (!normalized) {
    return NextResponse.json({ error: "Missing text or targetLanguage" }, { status: 400 });
  }
  const hash = cacheKey(normalized, targetLanguage);

  // Text-level cache: two readers translating the same message share one
  // upstream call. messages.translated_content still wins for the common
  // single-reader path; this catches duplicates and reposts.
  const { data: cached } = await supabase
    .from("translation_cache")
    .select("translated_text, detected_language")
    .eq("hash", hash)
    .maybeSingle();

  if (cached) {
    if (messageId) {
      await supabase
        .from("messages")
        .update({
          translated_content: cached.translated_text,
          translated_language: targetLanguage,
        })
        .eq("id", messageId);
    }
    return NextResponse.json({
      translatedText: cached.translated_text,
      detectedLanguage: cached.detected_language ?? "unknown",
    });
  }

  try {
    const result = await translateText(normalized, targetLanguage, user.id);

    await Promise.all([
      messageId
        ? supabase
            .from("messages")
            .update({
              translated_content: result.translatedText,
              translated_language: targetLanguage,
            })
            .eq("id", messageId)
        : Promise.resolve(),
      supabase.from("translation_cache").upsert(
        {
          hash,
          source_text: normalized,
          target_language: targetLanguage,
          translated_text: result.translatedText,
          detected_language: result.detectedLanguage,
        },
        { onConflict: "hash", ignoreDuplicates: true }
      ),
    ]);

    return NextResponse.json({
      translatedText: result.translatedText,
      detectedLanguage: result.detectedLanguage,
    });
  } catch (err: unknown) {
    if (err instanceof TranslateError) {
      // Log the upstream cause server-side; never leak it to the client.
      console.error("[translate]", err.code, err.message, err.upstream);
      return NextResponse.json(
        {
          error: {
            code: err.code,
            retryable: err.retryable,
            message: err.message,
          },
        },
        { status: err.status }
      );
    }
    console.error("[translate] unknown error:", err);
    return NextResponse.json(
      {
        error: {
          code: "unknown",
          retryable: false,
          message: "Translation failed",
        },
      },
      { status: 500 }
    );
  }
}
