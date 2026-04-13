const GOOGLE_TRANSLATE_API = "https://translation.googleapis.com/language/translate/v2";
const PAPAGO_API = "https://papago.apigw.ntruss.com/nmt/v1/translation";

// Languages that use Papago (better quality for CJK)
const PAPAGO_LANGUAGES = new Set(["ko", "ja", "zh-CN", "zh-TW"]);

// Map our internal codes to Papago codes
const PAPAGO_CODE_MAP: Record<string, string> = {
  ko: "ko",
  ja: "ja",
  zh: "zh-CN",    // our "zh" maps to Papago's "zh-CN"
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
};

function shouldUsePapago(targetLanguage: string): boolean {
  const papagoKey = process.env.NAVER_CLIENT_ID;
  if (!papagoKey) return false;
  return PAPAGO_LANGUAGES.has(targetLanguage) || targetLanguage === "zh";
}

async function translateWithPapago(
  text: string,
  targetLanguage: string
): Promise<{ translatedText: string; detectedLanguage: string }> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Papago API keys not configured");

  const target = PAPAGO_CODE_MAP[targetLanguage] || targetLanguage;

  const res = await fetch(PAPAGO_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
    body: JSON.stringify({
      source: "auto",
      target,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Papago error: ${err}`);
  }

  const data = await res.json();
  const result = data.message.result;
  return {
    translatedText: result.translatedText,
    detectedLanguage: result.srcLangType,
  };
}

async function translateWithGoogle(
  text: string,
  targetLanguage: string
): Promise<{ translatedText: string; detectedLanguage: string }> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new Error("Google Translate API key not configured");

  const res = await fetch(`${GOOGLE_TRANSLATE_API}?key=${key}`, {
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

export async function translateText(
  text: string,
  targetLanguage: string
): Promise<{ translatedText: string; detectedLanguage: string }> {
  if (shouldUsePapago(targetLanguage)) {
    return translateWithPapago(text, targetLanguage);
  }
  return translateWithGoogle(text, targetLanguage);
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese", engine: "Papago" },
  { code: "ko", name: "Korean", engine: "Papago" },
  { code: "zh", name: "Chinese (Simplified)", engine: "Papago" },
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
