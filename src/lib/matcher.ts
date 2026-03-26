import Anthropic from "@anthropic-ai/sdk";
import type { ProductWithPricing } from "./products";
import { buildAdcpProduct, type AdcpProduct } from "./adcp";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert media sales agent. Your job is to match an advertiser's brief to the most relevant advertising products from a publisher's catalog.

Given a brief and a product catalog, return up to 5 products that best match the brief. You may also generate custom products based on the catalog's capabilities if no exact match exists.

Always return valid JSON — an array of product objects. Do not include markdown fences or explanations outside the JSON array.

Each product must follow this exact schema:
{
  "product_id": string,
  "name": string,
  "description": string,
  "delivery_type": "guaranteed" | "non_guaranteed",
  "delivery_measurement": { "provider": "publisher" },
  "format_ids": [{ "agent_url": "https://creative.adcontextprotocol.org", "id": string }],
  "pricing_options": [{
    "pricing_model": string,
    "pricing_option_id": string,
    "currency": string,
    "floor_price": number
  }],
  "publisher_properties": [{ "publisher_domain": string, "selection_type": "all" }],
  "countries": string[],
  "brief_relevance": string,
  "is_custom": boolean
}

Ranking rules:
- Prioritise products that directly match the brief's objective (brand awareness, performance, etc.)
- Prefer catalog products (is_custom: false) over generated ones when they match well
- Include brief_relevance explaining why each product was selected`;

export async function matchProducts(
  brief: string,
  catalog: ProductWithPricing[],
  options: {
    deliveryType?: string;
    pricingModel?: string;
    countries?: string[];
  } = {}
): Promise<AdcpProduct[]> {
  if (catalog.length === 0) return [];

  // Build enriched brief
  let enrichedBrief = brief;
  if (options.deliveryType)
    enrichedBrief += `\nPreferred delivery: ${options.deliveryType}`;
  if (options.pricingModel)
    enrichedBrief += `\nPreferred pricing: ${options.pricingModel}`;
  if (options.countries?.length)
    enrichedBrief += `\nTarget countries: ${options.countries.join(", ")}`;

  const catalogJson = JSON.stringify(
    catalog.map((p) => buildAdcpProduct(p)),
    null,
    2
  );

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Brief: ${enrichedBrief}\n\nProduct catalog:\n${catalogJson}\n\nReturn a JSON array of matching products.`,
      },
    ],
  });

  const raw =
    message.content[0].type === "text" ? message.content[0].text.trim() : "[]";

  // Strip markdown fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as AdcpProduct[];
  } catch {
    return [];
  }
}
