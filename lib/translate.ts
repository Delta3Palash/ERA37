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

export type TranslateErrorCode = "rate_limit" | "config" | "unavailable" | "unknown";

export class TranslateError extends Error {
  code: TranslateErrorCode;
  retryable: boolean;
  status: number;
  upstream?: unknown;

  constructor(
    code: TranslateErrorCode,
    message: string,
    status: number,
    retryable: boolean,
    upstream?: unknown
  ) {
    super(message);
    this.name = "TranslateError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.upstream = upstream;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Per-Lambda-instance throttle. Caps concurrent Google calls and enforces
// a small gap between dispatches so a burst doesn't trip Google's per-user
// QPS cap. Best-effort across instances — fine for an alliance-scale app.
const MAX_CONCURRENT_GOOGLE = 2;
const MIN_GAP_MS = 200;
let activeGoogle = 0;
let lastGoogleStart = 0;
const googleWaiters: Array<() => void> = [];

async function acquireGoogleSlot(): Promise<void> {
  while (activeGoogle >= MAX_CONCURRENT_GOOGLE) {
    await new Promise<void>((r) => googleWaiters.push(r));
  }
  activeGoogle++;
  const gap = MIN_GAP_MS - (Date.now() - lastGoogleStart);
  if (gap > 0) await sleep(gap);
  lastGoogleStart = Date.now();
}

function releaseGoogleSlot(): void {
  activeGoogle--;
  const next = googleWaiters.shift();
  if (next) next();
}

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
  if (!clientId || !clientSecret) {
    throw new TranslateError("config", "Translation service isn't configured", 500, false);
  }

  const target = PAPAGO_CODE_MAP[targetLanguage] || targetLanguage;

  let res: Response;
  try {
    res = await fetch(PAPAGO_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
      body: new URLSearchParams({ source: "auto", target, text }),
    });
  } catch (e) {
    throw new TranslateError("unavailable", "Translation service is having trouble", 503, true, e);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new TranslateError(
        "rate_limit",
        "Translation temporarily unavailable — please try again in a few seconds",
        429,
        true,
        body
      );
    }
    if (res.status >= 500) {
      throw new TranslateError("unavailable", "Translation service is having trouble", 503, true, body);
    }
    throw new TranslateError("unknown", "Translation failed", 500, false, body);
  }

  const data = await res.json();
  const result = data.message.result;
  return {
    translatedText: result.translatedText,
    detectedLanguage: result.srcLangType,
  };
}

async function translateWithGoogleOnce(
  text: string,
  targetLanguage: string,
  quotaUser?: string
): Promise<{ translatedText: string; detectedLanguage: string }> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) {
    throw new TranslateError("config", "Translation service isn't configured", 500, false);
  }

  const params = new URLSearchParams({ key });
  // quotaUser segments Google's per-user quota by Supabase user id so one
  // chatty alliance member can't exhaust the shared API key for everyone.
  if (quotaUser) params.set("quotaUser", quotaUser);

  let res: Response;
  try {
    res = await fetch(`${GOOGLE_TRANSLATE_API}?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        target: targetLanguage,
        format: "text",
      }),
    });
  } catch (e) {
    throw new TranslateError("unavailable", "Translation service is having trouble", 503, true, e);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let reason = "";
    try {
      const parsed = JSON.parse(body);
      reason = parsed?.error?.errors?.[0]?.reason || "";
    } catch {
      // body wasn't JSON; reason stays empty
    }
    const isRateLimit =
      res.status === 429 || reason === "userRateLimitExceeded" || reason === "rateLimitExceeded";
    if (isRateLimit) {
      throw new TranslateError(
        "rate_limit",
        "Translation temporarily unavailable — please try again in a few seconds",
        429,
        true,
        body
      );
    }
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new TranslateError(
        "unavailable",
        "Translation quota reached for today",
        503,
        false,
        body
      );
    }
    if (res.status >= 500) {
      throw new TranslateError("unavailable", "Translation service is having trouble", 503, true, body);
    }
    throw new TranslateError("unknown", "Translation failed", 500, false, body);
  }

  const data = await res.json();
  const translation = data.data.translations[0];
  return {
    translatedText: translation.translatedText,
    detectedLanguage: translation.detectedSourceLanguage,
  };
}

async function translateWithGoogle(
  text: string,
  targetLanguage: string,
  quotaUser?: string
): Promise<{ translatedText: string; detectedLanguage: string }> {
  const delays = [0, 500, 1500];
  let lastErr: TranslateError | null = null;
  for (const d of delays) {
    if (d) await sleep(d + Math.floor(Math.random() * 200) - 100);
    await acquireGoogleSlot();
    try {
      return await translateWithGoogleOnce(text, targetLanguage, quotaUser);
    } catch (e) {
      if (!(e instanceof TranslateError) || !e.retryable) throw e;
      lastErr = e;
    } finally {
      releaseGoogleSlot();
    }
  }
  throw lastErr!;
}

export async function translateText(
  text: string,
  targetLanguage: string,
  quotaUser?: string
): Promise<{ translatedText: string; detectedLanguage: string }> {
  if (shouldUsePapago(targetLanguage)) {
    return translateWithPapago(text, targetLanguage);
  }
  return translateWithGoogle(text, targetLanguage, quotaUser);
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
