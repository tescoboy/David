import { Product, GetProductsRequest } from "./types";
import productsData from "../data/products.json";

// Resolve the agent URL for format_ids.agent_url
// Vercel sets VERCEL_URL automatically (without https://), AGENT_URL can override
function getAgentUrl(): string {
  if (process.env.AGENT_URL) return process.env.AGENT_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/mcp`;
  return "http://localhost:3000/api/mcp";
}

// Resolve publisher domain — used in publisher_properties array
function getPublisherDomain(): string {
  if (process.env.PUBLISHER_DOMAIN) return process.env.PUBLISHER_DOMAIN;
  if (process.env.VERCEL_URL) return process.env.VERCEL_URL;
  return "publisher.example.com";
}

// Inject agent_url into every format_id entry so evaluators can validate format specs
// Also inject publisher_properties with the correct domain string
function injectDynamicFields(products: Product[]): Product[] {
  const agentUrl = getAgentUrl();
  const publisherDomain = getPublisherDomain();
  return products.map((p) => ({
    ...p,
    format_ids: p.format_ids.map((f) => ({
      ...f,
      agent_url: agentUrl,
    })),
    publisher_properties: [publisherDomain],
  }));
}

// Load products from data file — can be overridden via PRODUCTS_JSON env var
// Always returns an array (never undefined/null) — defensive fallback included
function loadProducts(): Product[] {
  const envProducts = process.env.PRODUCTS_JSON;
  if (envProducts) {
    try {
      const parsed = JSON.parse(envProducts);
      if (Array.isArray(parsed) && parsed.length > 0) return injectDynamicFields(parsed as Product[]);
    } catch {
      console.error("Failed to parse PRODUCTS_JSON env var, using default products");
    }
  }
  // Static import bundled at build time — guaranteed non-empty
  const defaults = productsData as Product[];
  const raw = Array.isArray(defaults) && defaults.length > 0 ? defaults : [];
  return injectDynamicFields(raw);
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
    if (product.delivery_type === "non_guaranteed") score += 5;
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

    // Return top 5 matching products. If nothing scores, fall back to all filtered
    // products (so callers always get inventory, never an empty list from brief scoring)
    const relevant = scored.filter((s) => s.score > 0).slice(0, 5);
    const results = relevant.length > 0
      ? relevant.map((s) => s.product)
      : filtered.slice(0, 5);

    // Ultimate safety net — if filters wiped everything, return all products
    return results.length > 0 ? results : all.slice(0, 5);
  }

  // No brief — return all filtered, falling back to all if filters eliminated everything
  return (filtered.length > 0 ? filtered : all) ?? [];
}

export function getProductById(id: string): Product | undefined {
  return loadProducts().find((p) => p.product_id === id);
}
