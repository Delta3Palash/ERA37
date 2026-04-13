const TENOR_API = "https://tenor.googleapis.com/v2";

export interface TenorGif {
  id: string;
  url: string;
  previewUrl: string;
}

function getApiKey(): string | null {
  return process.env.NEXT_PUBLIC_TENOR_API_KEY || null;
}

function mapResults(results: any[]): TenorGif[] {
  return results.map((r: any) => ({
    id: r.id,
    url: r.media_formats?.gif?.url || r.media_formats?.mediumgif?.url || "",
    previewUrl: r.media_formats?.tinygif?.url || r.media_formats?.nanogif?.url || "",
  })).filter((g) => g.url && g.previewUrl);
}

export async function searchGifs(query: string, limit = 20): Promise<TenorGif[]> {
  const key = getApiKey();
  if (!key) return [];

  const params = new URLSearchParams({
    q: query,
    key,
    client_key: "era37",
    limit: String(limit),
    media_filter: "gif,tinygif",
  });

  const res = await fetch(`${TENOR_API}/search?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  return mapResults(data.results || []);
}

export async function getTrendingGifs(limit = 20): Promise<TenorGif[]> {
  const key = getApiKey();
  if (!key) return [];

  const params = new URLSearchParams({
    key,
    client_key: "era37",
    limit: String(limit),
    media_filter: "gif,tinygif",
  });

  const res = await fetch(`${TENOR_API}/featured?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  return mapResults(data.results || []);
}

export function isTenorConfigured(): boolean {
  return !!getApiKey();
}
