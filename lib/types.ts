// AdCP protocol types for the Prebid Sales Agent

export interface FormatId {
  id: string;
  agent_url?: string;
}

export interface PriceGuidance {
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
}

export interface PricingOption {
  pricing_option_id?: string;
  pricing_model: "cpm" | "cpc" | "flat" | "cpe" | "cpcv";
  currency?: string;
  fixed_price?: number;
  floor_price?: number;
  price_guidance?: PriceGuidance;
}

export interface PublisherPropertySelector {
  publisher_domain: string;
  selection_type: "all" | "by_id" | "by_tag";
  property_ids?: string[];
  tags?: string[];
}

export interface TargetingTemplate {
  geo?: { countries?: string[]; metros?: string[] };
  audience?: { age_groups?: string[]; interests?: string[] };
  device_targets?: string[];
}

export interface Product {
  product_id: string;
  name: string;
  description: string;
  channels: string[];
  delivery_type: "guaranteed" | "non_guaranteed";
  format_ids: FormatId[];
  pricing_options: PricingOption[];
  publisher_properties: PublisherPropertySelector[];
  targeting_template?: TargetingTemplate;
  is_custom?: boolean;
  countries?: string[];
}

export interface GetProductsRequest {
  brief?: string;
  brand?: { domain?: string; brand_id?: string };
  filters?: {
    delivery_type?: string;
    channels?: string[];
    format_types?: string[];
    device_types?: string[];
    min_budget?: number;
  };
  adcp_version?: string;
}

export interface GetProductsResponse {
  products: Product[];
}

export interface MediaBuy {
  media_buy_id: string;
  buyer_ref: string;
  status: "pending_activation" | "active" | "paused" | "completed" | "rejected" | "canceled";
  packages: MediaBuyPackage[];
  start_time?: string;
  end_time?: string;
  budget?: { amount: number; currency: string };
  created_at: string;
  updated_at: string;
  brand?: { domain?: string };
}

export interface MediaBuyPackage {
  package_id: string;
  product_id: string;
  budget?: { amount: number; currency: string };
  impressions?: number;
  targeting?: TargetingTemplate;
}

export interface CreateMediaBuyRequest {
  buyer_ref: string;
  brand?: { domain?: string };
  packages: Array<{
    product_id: string;
    budget?: { amount: number; currency: string };
    impressions?: number;
    targeting?: TargetingTemplate;
  }>;
  start_time?: string;
  end_time?: string;
  budget?: { amount: number; currency: string };
  po_number?: string;
}

export interface McpRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// AdCP Capabilities response
export interface AdcpCapabilities {
  adcp: { major_versions: number[]; version?: string };
  adcp_version?: string;
  supported_protocols: string[];
  portfolio?: {
    description: string;
    primary_channels?: string[];
    publisher_domains?: string[];
    advertising_policies?: string;
  };
  execution?: {
    media_buy?: { model: string };
  };
  targeting?: {
    geo?: {
      countries?: { supported: boolean };
      metros?: { supported: boolean };
      postal_areas?: { supported: boolean };
    };
    audience?: {
      demographics?: boolean;
      interest?: boolean;
      custom_segments?: boolean;
    };
  };
  features?: {
    content_standards?: boolean;
    inline_creative_management?: boolean;
    property_list_filtering?: boolean;
  };
}
