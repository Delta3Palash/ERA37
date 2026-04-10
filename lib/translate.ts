const TRANSLATE_API = "https://translation.googleapis.com/language/translate/v2";

export async function translateText(
  text: string,
  targetLanguage: string,
  apiKey?: string
): Promise<{ translatedText: string; detectedLanguage: string }> {
  const key = apiKey || process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new Error("Google Translate API key not configured");

  const res = await fetch(`${TRANSLATE_API}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      target: targetLanguage,
      format: "text",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Translation error: ${err}`);
  }

  const data = await res.json();
  const translation = data.data.translations[0];
  return {
    translatedText: translation.translatedText,
    detectedLanguage: translation.detectedSourceLanguage,
  };
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "bn", name: "Bengali" },
  { code: "tr", name: "Turkish" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "uk", name: "Ukrainian" },
  { code: "sv", name: "Swedish" },
];
