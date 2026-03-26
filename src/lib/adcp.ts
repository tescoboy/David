import type { ProductWithPricing } from "./products";

const CREATIVE_AGENT_URL = "https://creative.adcontextprotocol.org";

export type AdcpProduct = {
  product_id: string;
  name: string;
  description: string;
  delivery_type: "guaranteed" | "non_guaranteed";
  delivery_measurement: { provider: string };
  format_ids: Array<{ agent_url: string; id: string }>;
  pricing_options: Array<{
    pricing_model: string;
    pricing_option_id: string;
    currency: string;
    floor_price?: number;
  }>;
  publisher_properties: Array<{
    publisher_domain: string;
    selection_type: string;
  }>;
  countries?: string[];
  brief_relevance?: string;
  is_custom?: boolean;
};

export function buildAdcpProduct(
  product: ProductWithPricing,
  briefRelevance?: string,
  isCustom = false
): AdcpProduct {
  const formatIds = (product.formatIds as Array<{ agent_url?: string; id: string }> | null) ?? [];
  const countries = (product.countries as string[] | null) ?? undefined;
  const publisherDomain =
    process.env.PUBLISHER_DOMAIN ?? "publisher.example.com";

  return {
    product_id: product.id,
    name: product.name,
    description: product.description ?? "",
    delivery_type: product.deliveryType as "guaranteed" | "non_guaranteed",
    delivery_measurement: { provider: "publisher" },
    format_ids: formatIds.map((f) => ({
      agent_url: f.agent_url ?? CREATIVE_AGENT_URL,
      id: f.id,
    })),
    pricing_options: product.pricingOptions.map((po, i) => {
      const floorPrice = po.isFixed
        ? po.rate
          ? parseFloat(po.rate)
          : undefined
        : (po.priceGuidance as { floor?: number } | null)?.floor;
      return {
        pricing_model: po.pricingModel,
        pricing_option_id: `${po.pricingModel}-${po.currency.toLowerCase()}-${i}`,
        currency: po.currency,
        ...(floorPrice !== undefined ? { floor_price: floorPrice } : {}),
      };
    }),
    publisher_properties: [
      { publisher_domain: publisherDomain, selection_type: "all" },
    ],
    ...(countries ? { countries } : {}),
    ...(briefRelevance ? { brief_relevance: briefRelevance } : {}),
    is_custom: isCustom,
  };
}
