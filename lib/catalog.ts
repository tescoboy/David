/**
 * Product catalog — AdCP v3 compliant product definitions.
 * publisher_domain is injected at runtime so agent_url stays consistent.
 */

export interface PricingOption {
  pricing_option_id: string;
  pricing_model: "cpm";
  fixed_price: number;
  currency: string;
  min_spend_per_package?: number;
}

export interface Product {
  product_id: string;
  name: string;
  description: string;
  channels: string[];
  delivery_type: "guaranteed" | "non_guaranteed";
  format_ids: Array<{ agent_url: string; id: string }>;
  publisher_properties: Array<{
    publisher_domain: string;
    selection_type: "all";
  }>;
  pricing_options: PricingOption[];
}

function getAgentUrl(): string {
  if (process.env.AGENT_URL) return process.env.AGENT_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/mcp`;
  return "http://localhost:3000/api/mcp";
}

function getPublisherDomain(): string {
  return process.env.PUBLISHER_DOMAIN ?? "publisher.example.com";
}

export function getProducts(): Product[] {
  const agentUrl = getAgentUrl();
  const domain = getPublisherDomain();

  return [
    {
      product_id: "premium-display-run-of-site",
      name: "Premium Display — Run of Site",
      description: "High-impact display placements across all site sections",
      channels: ["display"],
      delivery_type: "guaranteed",
      format_ids: [
        { agent_url: agentUrl, id: "banner-300x250" },
        { agent_url: agentUrl, id: "banner-728x90" },
        { agent_url: agentUrl, id: "banner-970x250" },
      ],
      publisher_properties: [{ publisher_domain: domain, selection_type: "all" }],
      pricing_options: [
        {
          pricing_option_id: "display-cpm-standard",
          pricing_model: "cpm",
          fixed_price: 12.0,
          currency: "USD",
          min_spend_per_package: 500,
        },
      ],
    },
    {
      product_id: "video-preroll",
      name: "Pre-Roll Video",
      description: "15s and 30s pre-roll video inventory before premium content",
      channels: ["olv"],
      delivery_type: "guaranteed",
      format_ids: [
        { agent_url: agentUrl, id: "video-preroll-15s" },
        { agent_url: agentUrl, id: "video-preroll-30s" },
      ],
      publisher_properties: [{ publisher_domain: domain, selection_type: "all" }],
      pricing_options: [
        {
          pricing_option_id: "video-cpm-standard",
          pricing_model: "cpm",
          fixed_price: 25.0,
          currency: "USD",
          min_spend_per_package: 1000,
        },
      ],
    },
    {
      product_id: "native-content",
      name: "Native Content Sponsorship",
      description: "Branded native content placements in article feeds",
      channels: ["display"],
      delivery_type: "non_guaranteed",
      format_ids: [
        { agent_url: agentUrl, id: "native-feed-1x1" },
      ],
      publisher_properties: [{ publisher_domain: domain, selection_type: "all" }],
      pricing_options: [
        {
          pricing_option_id: "native-cpm-standard",
          pricing_model: "cpm",
          fixed_price: 8.0,
          currency: "USD",
          min_spend_per_package: 250,
        },
      ],
    },
  ];
}

export function getProductById(id: string): Product | undefined {
  return getProducts().find((p) => p.product_id === id);
}
