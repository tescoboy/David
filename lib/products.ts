import { Product, GetProductsRequest } from "./types";
import productsData from "../data/products.json";

// Load products from data file — can be overridden via PRODUCTS_JSON env var
function loadProducts(): Product[] {
  const envProducts = process.env.PRODUCTS_JSON;
  if (envProducts) {
    try {
      return JSON.parse(envProducts) as Product[];
    } catch {
      console.error("Failed to parse PRODUCTS_JSON env var, using default products");
    }
  }
  return productsData as Product[];
}

// Simple text relevance scoring — ranks products by how well they match a brief
function scoreProduct(product: Product, brief: string): number {
  const briefLower = brief.toLowerCase();
  let score = 0;

  // Channel keyword matching
  const channelKeywords: Record<string, string[]> = {
    olv: ["video", "pre-roll", "pre roll", "youtube", "streaming video", "online video", "olv", "vod"],
    ctv: ["ctv", "connected tv", "streaming", "smart tv", "ott", "roku", "hulu", "netflix"],
    display: ["display", "banner", "awareness", "brand", "native", "visual"],
    streaming_audio: ["audio", "podcast", "music", "radio", "streaming audio", "spotify"],
    social: ["social", "facebook", "instagram", "twitter", "tiktok", "linkedin"],
    search: ["search", "google", "bing", "keyword", "intent"],
  };

  for (const channel of product.channels) {
    const keywords = channelKeywords[channel] || [];
    for (const kw of keywords) {
      if (briefLower.includes(kw)) score += 10;
    }
  }

  // Delivery type matching
  if (briefLower.includes("guaranteed") || briefLower.includes("reservation")) {
    if (product.delivery_type === "guaranteed") score += 5;
  }
  if (briefLower.includes("programmatic") || briefLower.includes("auction") || briefLower.includes("rtb")) {
    if (product.delivery_type === "auction") score += 5;
  }

  // Device targeting keywords
  const targeting = product.targeting_template || {};
  const devices = (targeting.device_targets || []).map((d) => d.toLowerCase());

  if (briefLower.includes("mobile") || briefLower.includes("smartphone") || briefLower.includes("app")) {
    if (devices.includes("mobile")) score += 3;
  }
  if (briefLower.includes("desktop") || briefLower.includes("computer")) {
    if (devices.includes("desktop")) score += 3;
  }
  if (briefLower.includes("tablet")) {
    if (devices.includes("tablet")) score += 3;
  }

  // Geo keyword matching
  const countries = product.countries || [];
  const geoKeywords: Record<string, string[]> = {
    US: ["us", "usa", "united states", "america", "american"],
    GB: ["uk", "united kingdom", "britain", "british", "england"],
    CA: ["canada", "canadian"],
    AU: ["australia", "australian"],
    DE: ["germany", "german", "deutschland"],
    FR: ["france", "french"],
  };
  for (const [country, keywords] of Object.entries(geoKeywords)) {
    if (countries.includes(country)) {
      for (const kw of keywords) {
        if (briefLower.includes(kw)) score += 2;
      }
    }
  }

  // Description keyword matching (lower weight)
  const descWords = product.description.toLowerCase().split(/\s+/);
  const briefWords = briefLower.split(/\s+/);
  for (const word of briefWords) {
    if (word.length > 4 && descWords.some((d) => d.includes(word))) score += 1;
  }

  return score;
}

export function getProducts(req: GetProductsRequest = {}): Product[] {
  const all = loadProducts();
  let filtered = all;

  // Apply channel filter
  if (req.filters?.channels && req.filters.channels.length > 0) {
    const reqChannels = req.filters.channels.map((c) => c.toLowerCase());
    filtered = filtered.filter((p) =>
      p.channels.some((c) => reqChannels.includes(c.toLowerCase()))
    );
  }

  // Apply delivery type filter
  if (req.filters?.delivery_type) {
    filtered = filtered.filter(
      (p) => p.delivery_type === req.filters!.delivery_type
    );
  }

  // Apply device type filter
  if (req.filters?.device_types && req.filters.device_types.length > 0) {
    const reqDevices = req.filters.device_types.map((d) => d.toLowerCase());
    filtered = filtered.filter((p) => {
      const devices = (p.targeting_template?.device_targets || []).map((d) =>
        d.toLowerCase()
      );
      return reqDevices.some((d) => devices.includes(d));
    });
  }

  // Score and sort by relevance if brief provided
  if (req.brief && req.brief.trim()) {
    const scored = filtered.map((p) => ({
      product: p,
      score: scoreProduct(p, req.brief!),
    }));
    scored.sort((a, b) => b.score - a.score);

    // Return top 5, minimum score of 1 if brief given
    const relevant = scored.filter((s) => s.score > 0).slice(0, 5);
    return relevant.length > 0
      ? relevant.map((s) => s.product)
      : filtered.slice(0, 5);
  }

  return filtered;
}

export function getProductById(id: string): Product | undefined {
  return loadProducts().find((p) => p.product_id === id);
}
