/**
 * Seed dummy products into Neon Postgres.
 * Run with: npx tsx scripts/seed.ts
 * Requires DATABASE_URL to be set.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { products, pricingOptions } from "../src/lib/schema";

const AGENT_URL = "https://creative.adcontextprotocol.org";

type PricingEntry = {
  pricingModel: string;
  rate: string | null;
  currency: string;
  isFixed: boolean;
  priceGuidance?: { floor: number };
};

type ProductEntry = {
  name: string;
  description: string;
  deliveryType: string;
  formatIds: Array<{ agent_url: string; id: string }>;
  countries?: string[];
  channels: string[];
  minSpend?: string;
  currency: string;
  pricing: PricingEntry[];
};

const PRODUCTS: ProductEntry[] = [
  {
    name: "Homepage Takeover",
    description:
      "Premium guaranteed placement on the homepage. Maximum visibility for brand awareness campaigns. Desktop and mobile optimised.",
    deliveryType: "guaranteed",
    formatIds: [
      { agent_url: AGENT_URL, id: "display_970x250" },
      { agent_url: AGENT_URL, id: "display_728x90" },
      { agent_url: AGENT_URL, id: "display_320x50" },
    ],
    countries: ["US", "GB", "CA", "AU"],
    channels: ["display"],
    minSpend: "15000",
    currency: "USD",
    pricing: [
      { pricingModel: "cpm", rate: "25.00", currency: "USD", isFixed: true },
    ],
  },
  {
    name: "Run of Site — Display",
    description:
      "Non-guaranteed display advertising across all available inventory. Supports standard IAB display formats. Ideal for performance campaigns.",
    deliveryType: "non_guaranteed",
    formatIds: [
      { agent_url: AGENT_URL, id: "display_300x250" },
      { agent_url: AGENT_URL, id: "display_728x90" },
      { agent_url: AGENT_URL, id: "display_320x50" },
      { agent_url: AGENT_URL, id: "display_300x600" },
    ],
    channels: ["display"],
    minSpend: "1000",
    currency: "USD",
    pricing: [
      {
        pricingModel: "cpm",
        rate: null,
        currency: "USD",
        isFixed: false,
        priceGuidance: { floor: 5 },
      },
    ],
  },
  {
    name: "Video Pre-Roll",
    description:
      "Standard pre-roll video advertising. VAST 4.0 compliant. 15s and 30s formats. Reaches engaged users before video content.",
    deliveryType: "non_guaranteed",
    formatIds: [{ agent_url: AGENT_URL, id: "video_vast" }],
    channels: ["video"],
    minSpend: "5000",
    currency: "USD",
    pricing: [
      {
        pricingModel: "cpm",
        rate: null,
        currency: "USD",
        isFixed: false,
        priceGuidance: { floor: 15 },
      },
    ],
  },
  {
    name: "Mobile Interstitial",
    description:
      "Full-screen mobile interstitial with frequency capping. High engagement rates on mobile devices. Served between page transitions.",
    deliveryType: "guaranteed",
    formatIds: [
      { agent_url: AGENT_URL, id: "display_320x480" },
      { agent_url: AGENT_URL, id: "display_300x250" },
    ],
    channels: ["display"],
    minSpend: "2500",
    currency: "USD",
    pricing: [
      { pricingModel: "cpm", rate: "15.00", currency: "USD", isFixed: true },
    ],
  },
  {
    name: "Native In-Feed",
    description:
      "Native advertising that blends with editorial content. Appears within article feeds. Drives high engagement and brand recall.",
    deliveryType: "non_guaranteed",
    formatIds: [{ agent_url: AGENT_URL, id: "native_infeed" }],
    channels: ["native"],
    minSpend: "1000",
    currency: "USD",
    pricing: [
      {
        pricingModel: "cpm",
        rate: null,
        currency: "USD",
        isFixed: false,
        priceGuidance: { floor: 8 },
      },
    ],
  },
  {
    name: "Contextual Display",
    description:
      "Cookie-free display advertising contextually targeted to page content. Works across all browsers. No consent required.",
    deliveryType: "non_guaranteed",
    formatIds: [
      { agent_url: AGENT_URL, id: "display_300x250" },
      { agent_url: AGENT_URL, id: "display_728x90" },
      { agent_url: AGENT_URL, id: "display_160x600" },
    ],
    channels: ["display"],
    minSpend: "1000",
    currency: "USD",
    pricing: [
      {
        pricingModel: "cpm",
        rate: null,
        currency: "USD",
        isFixed: false,
        priceGuidance: { floor: 6 },
      },
    ],
  },
  {
    name: "Newsletter Sponsorship",
    description:
      "Dedicated sponsor placement in daily email newsletters. Reaches highly engaged opted-in subscribers.",
    deliveryType: "guaranteed",
    formatIds: [
      { agent_url: AGENT_URL, id: "display_600x200" },
      { agent_url: AGENT_URL, id: "display_300x250" },
    ],
    countries: ["US", "GB"],
    channels: ["email"],
    minSpend: "5000",
    currency: "USD",
    pricing: [
      { pricingModel: "cpm", rate: "35.00", currency: "USD", isFixed: true },
    ],
  },
  {
    name: "Sponsored Content",
    description:
      "Long-form branded content published on-site alongside editorial. High-dwell, high-recall format for brand storytelling.",
    deliveryType: "guaranteed",
    formatIds: [{ agent_url: AGENT_URL, id: "native_article" }],
    countries: ["US", "GB", "CA"],
    channels: ["native"],
    minSpend: "15000",
    currency: "USD",
    pricing: [
      {
        pricingModel: "flat_rate",
        rate: "15000.00",
        currency: "USD",
        isFixed: true,
      },
    ],
  },
  {
    name: "First-Party Audience Targeting",
    description:
      "Display and video served to first-party registered user segments. Cookieless and consent-based. Segments: high-income professionals, frequent shoppers, tech enthusiasts.",
    deliveryType: "non_guaranteed",
    formatIds: [
      { agent_url: AGENT_URL, id: "display_300x250" },
      { agent_url: AGENT_URL, id: "display_728x90" },
      { agent_url: AGENT_URL, id: "video_vast" },
    ],
    countries: ["US", "GB"],
    channels: ["display", "video"],
    minSpend: "5000",
    currency: "USD",
    pricing: [
      { pricingModel: "cpm", rate: "22.00", currency: "USD", isFixed: true },
    ],
  },
  {
    name: "Connected TV Pre-Roll",
    description:
      "Non-skippable video pre-roll on Connected TV inventory. Premium lean-back environment with 100% viewability. 15s and 30s formats.",
    deliveryType: "guaranteed",
    formatIds: [{ agent_url: AGENT_URL, id: "video_vast" }],
    countries: ["US"],
    channels: ["ctv", "video"],
    minSpend: "10000",
    currency: "USD",
    pricing: [
      { pricingModel: "cpm", rate: "35.00", currency: "USD", isFixed: true },
    ],
  },
];

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, {
    schema: { products, pricingOptions },
  });

  // Ensure tables exist
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      delivery_type TEXT NOT NULL DEFAULT 'non_guaranteed',
      format_ids JSONB NOT NULL DEFAULT '[]',
      countries JSONB,
      channels JSONB,
      property_tags JSONB DEFAULT '["all_inventory"]',
      min_spend NUMERIC,
      currency TEXT NOT NULL DEFAULT 'USD',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS pricing_options (
      id SERIAL PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      pricing_model TEXT NOT NULL,
      rate NUMERIC,
      currency TEXT NOT NULL DEFAULT 'USD',
      is_fixed BOOLEAN NOT NULL DEFAULT true,
      price_guidance JSONB
    )
  `;

  let inserted = 0;
  let skipped = 0;

  for (const p of PRODUCTS) {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.name, p.name))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const [inserted_product] = await db
      .insert(products)
      .values({
        name: p.name,
        description: p.description,
        deliveryType: p.deliveryType,
        formatIds: p.formatIds,
        countries: p.countries ?? null,
        channels: p.channels,
        minSpend: p.minSpend ?? null,
        currency: p.currency,
        isActive: true,
      })
      .returning({ id: products.id });

    for (const pr of p.pricing) {
      await db.insert(pricingOptions).values({
        productId: inserted_product.id,
        pricingModel: pr.pricingModel,
        rate: pr.rate,
        currency: pr.currency,
        isFixed: pr.isFixed,
        priceGuidance: pr.priceGuidance ?? null,
      });
    }

    inserted++;
  }

  console.log(
    `✅ Seed complete: ${inserted} inserted, ${skipped} already existed`
  );
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
