import { MediaBuy } from "./types";

// In-memory store for media buys.
// NOTE: This resets on cold starts. For production, swap this for
// Vercel KV (Redis) or Vercel Postgres.
const mediaBuys = new Map<string, MediaBuy>();

export function saveMediaBuy(buy: MediaBuy): void {
  mediaBuys.set(buy.media_buy_id, buy);
}

export function getMediaBuy(id: string): MediaBuy | undefined {
  return mediaBuys.get(id);
}

export function getAllMediaBuys(): MediaBuy[] {
  return Array.from(mediaBuys.values());
}

export function updateMediaBuy(id: string, updates: Partial<MediaBuy>): MediaBuy | null {
  const existing = mediaBuys.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
  mediaBuys.set(id, updated);
  return updated;
}
