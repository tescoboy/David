import {
  pgTable,
  text,
  boolean,
  numeric,
  serial,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const products = pgTable("products", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  deliveryType: text("delivery_type").notNull().default("non_guaranteed"),
  formatIds: jsonb("format_ids").notNull().default(sql`'[]'::jsonb`),
  countries: jsonb("countries"),
  channels: jsonb("channels"),
  propertyTags: jsonb("property_tags").default(sql`'["all_inventory"]'::jsonb`),
  minSpend: numeric("min_spend"),
  currency: text("currency").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const pricingOptions = pgTable("pricing_options", {
  id: serial("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  pricingModel: text("pricing_model").notNull(),
  rate: numeric("rate"),
  currency: text("currency").notNull().default("USD"),
  isFixed: boolean("is_fixed").notNull().default(true),
  priceGuidance: jsonb("price_guidance"),
});

export type Product = typeof products.$inferSelect;
export type PricingOption = typeof pricingOptions.$inferSelect;
