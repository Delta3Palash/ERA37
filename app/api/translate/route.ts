import { createClient } from "@/lib/supabase/server";
import { translateText } from "@/lib/translate";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId, text, targetLanguage } = await req.json();

  if (!text || !targetLanguage) {
    return NextResponse.json({ error: "Missing text or targetLanguage" }, { status: 400 });
  }

  try {
    const result = await translateText(text, targetLanguage);

    // Cache translation in DB
    if (messageId) {
      await supabase
        .from("messages")
        .update({
          translated_content: result.translatedText,
          translated_language: targetLanguage,
        })
        .eq("id", messageId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      translatedText: result.translatedText,
      detectedLanguage: result.detectedLanguage,
    });
  } catch (err: any) {
    console.error("Translation error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
