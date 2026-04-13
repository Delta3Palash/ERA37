// GIF API powered by KLIPY (Tenor replacement)
const KLIPY_API = "https://api.klipy.com/api/v1";

export interface GifItem {
  id: number;
  url: string;
  previewUrl: string;
}

function getApiKey(): string | null {
  return process.env.NEXT_PUBLIC_KLIPY_API_KEY || null;
}

function mapResults(results: any[]): GifItem[] {
  return results.map((r: any) => ({
    id: r.id,
    url: r.file?.hd?.gif?.url || r.file?.md?.gif?.url || "",
    previewUrl: r.file?.sm?.webp?.url || r.file?.sm?.gif?.url || r.file?.xs?.webp?.url || "",
  })).filter((g) => g.url && g.previewUrl);
}

export async function searchGifs(query: string, limit = 20): Promise<GifItem[]> {
  const key = getApiKey();
  if (!key) return [];

  const params = new URLSearchParams({
    q: query,
    per_page: String(limit),
  });

  try {
    const res = await fetch(`${KLIPY_API}/${key}/gifs/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return mapResults(data.data?.data || []);
  } catch {
    return [];
  }
}

export async function getTrendingGifs(limit = 20): Promise<GifItem[]> {
  const key = getApiKey();
  if (!key) return [];

  try {
    const res = await fetch(`${KLIPY_API}/${key}/gifs/trending?per_page=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return mapResults(data.data?.data || []);
  } catch {
    return [];
  }
}

export function isGifConfigured(): boolean {
  return !!getApiKey();
}
