import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { products, pricingOptions } from "./schema";

export type ProductWithPricing = {
  id: string;
  name: string;
  description: string | null;
  deliveryType: string;
  formatIds: unknown;
  countries: unknown;
  channels: unknown;
  currency: string;
  minSpend: string | null;
  pricingOptions: Array<{
    pricingModel: string;
    rate: string | null;
    currency: string;
    isFixed: boolean;
    priceGuidance: unknown;
  }>;
};

export async function getActiveProducts(): Promise<ProductWithPricing[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .leftJoin(pricingOptions, eq(pricingOptions.productId, products.id))
    .where(eq(products.isActive, true));

  // Group pricing options by product
  const productMap = new Map<string, ProductWithPricing>();
  for (const row of rows) {
    const p = row.products;
    if (!productMap.has(p.id)) {
      productMap.set(p.id, {
        id: p.id,
        name: p.name,
        description: p.description,
        deliveryType: p.deliveryType,
        formatIds: p.formatIds,
        countries: p.countries,
        channels: p.channels,
        currency: p.currency,
        minSpend: p.minSpend,
        pricingOptions: [],
      });
    }
    if (row.pricing_options) {
      productMap.get(p.id)!.pricingOptions.push({
        pricingModel: row.pricing_options.pricingModel,
        rate: row.pricing_options.rate,
        currency: row.pricing_options.currency,
        isFixed: row.pricing_options.isFixed,
        priceGuidance: row.pricing_options.priceGuidance,
      });
    }
  }
  return Array.from(productMap.values());
}
