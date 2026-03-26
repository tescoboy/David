import { getActiveProducts } from "@/lib/products";
import { matchProducts } from "@/lib/matcher";
import { getDb } from "@/lib/db";
import { mediaBuys } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

// MCP JSON-RPC types
type McpRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type McpResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function ok(id: string | number | null, result: unknown): McpResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(
  id: string | number | null,
  code: number,
  message: string
): McpResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function adcpError(code: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }],
  };
}

function formatMediaBuy(row: {
  id: string;
  buyerRef: string | null;
  status: string;
  packages: unknown;
  totalBudget: string | null;
  startTime: string | null;
  endTime: string | null;
  createdAt: Date | null;
}) {
  return {
    media_buy_id: row.id,
    buyer_ref: row.buyerRef,
    status: row.status,
    packages: row.packages,
    total_budget: row.totalBudget ? Number(row.totalBudget) : null,
    start_time: row.startTime,
    end_time: row.endTime,
    created_at: row.createdAt,
    snapshots: { impressions: 0, spend: 0, clicks: 0 },
  };
}

const TOOLS = [
  {
    name: "get_adcp_capabilities",
    description:
      "Returns the advertising capabilities of this publisher's MCP server, including supported protocol tracks and media buy options.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_products",
    description:
      "Find advertising products that match an advertiser's campaign brief. Returns AdCP-compliant product recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        brief: {
          type: "string",
          description:
            "Natural language description of the advertising campaign, objectives, audience, and budget",
        },
        brand: {
          type: "object",
          properties: { domain: { type: "string" } },
          description: "Brand domain for contextual filtering",
        },
        delivery_type: {
          type: "string",
          enum: ["guaranteed", "non_guaranteed"],
        },
        pricing_model: { type: "string" },
        countries: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "create_media_buy",
    description:
      "Book advertising inventory by creating a media buy from products returned by get_products.",
    inputSchema: {
      type: "object",
      properties: {
        buyer_ref: { type: "string" },
        packages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string" },
              pricing_option_id: { type: "string" },
              budget: { type: "number" },
              bid_price: { type: "number" },
              start_time: {},
              end_time: {},
              targeting_overlay: { type: "object" },
            },
            required: ["product_id", "pricing_option_id"],
          },
        },
        start_time: {},
        end_time: {},
        total_budget: { type: "number" },
        currency: { type: "string" },
        advertiser_domain: { type: "string" },
        brand: { type: "object" },
      },
      required: ["packages"],
    },
  },
  {
    name: "update_media_buy",
    description: "Update an existing media buy — pause, cancel, or modify budget/flights.",
    inputSchema: {
      type: "object",
      properties: {
        media_buy_id: { type: "string" },
        paused: { type: "boolean" },
        canceled: { type: "boolean" },
        cancellation_reason: { type: "string" },
        total_budget: { type: "number" },
        start_time: {},
        end_time: {},
      },
      required: ["media_buy_id"],
    },
  },
  {
    name: "get_media_buy",
    description: "Retrieve a previously created media buy by ID.",
    inputSchema: {
      type: "object",
      properties: {
        media_buy_id: { type: "string" },
      },
      required: ["media_buy_id"],
    },
  },
  {
    name: "get_media_buys",
    description: "List media buys, optionally filtered by IDs or buyer refs.",
    inputSchema: {
      type: "object",
      properties: {
        media_buy_ids: { type: "array", items: { type: "string" } },
        buyer_refs: { type: "array", items: { type: "string" } },
        status: { type: "string" },
      },
    },
  },
  {
    name: "get_media_buy_delivery",
    description: "Get delivery metrics (impressions, spend, clicks) for media buys.",
    inputSchema: {
      type: "object",
      properties: {
        media_buy_ids: { type: "array", items: { type: "string" } },
        buyer_refs: { type: "array", items: { type: "string" } },
      },
    },
  },
];

// ── Zod schemas ────────────────────────────────────────────────────────────────

const GetProductsArgs = z
  .object({
    brief: z.string().optional(),
    brand: z.unknown().optional(),
    delivery_type: z.enum(["guaranteed", "non_guaranteed"]).optional(),
    pricing_model: z.string().optional(),
    countries: z.array(z.string()).optional(),
  })
  .passthrough();

const TimeValue = z.union([
  z.string(),
  z.object({ type: z.string(), datetime: z.string().optional() }).passthrough(),
]);

const PackageInput = z
  .object({
    product_id: z.string(),
    pricing_option_id: z.string(),
    budget: z.number().optional(),
    bid_price: z.number().optional(),
    start_time: TimeValue.optional(),
    end_time: TimeValue.optional(),
    targeting_overlay: z.unknown().optional(),
  })
  .passthrough();

const CreateMediaBuyArgs = z
  .object({
    buyer_ref: z.string().optional(),
    packages: z.array(PackageInput).optional(),
    // flat fallback
    product_id: z.string().optional(),
    pricing_option_id: z.string().optional(),
    budget: z.number().optional(),
    start_time: TimeValue.optional(),
    end_time: TimeValue.optional(),
    total_budget: z.number().optional(),
    currency: z.string().optional(),
    advertiser_domain: z.string().optional(),
    brand: z.unknown().optional(),
  })
  .passthrough();

const UpdateMediaBuyArgs = z
  .object({
    media_buy_id: z.string(),
    paused: z.boolean().optional(),
    canceled: z.boolean().optional(),
    cancellation_reason: z.string().optional(),
    total_budget: z.number().optional(),
    start_time: TimeValue.optional(),
    end_time: TimeValue.optional(),
  })
  .passthrough();

const GetMediaBuyArgs = z.object({ media_buy_id: z.string() });

const GetMediaBuysArgs = z
  .object({
    media_buy_ids: z.array(z.string()).optional(),
    buyer_refs: z.array(z.string()).optional(),
    status: z.string().optional(),
  })
  .passthrough();

// ── Tool handlers ──────────────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  // ── get_adcp_capabilities ──────────────────────────────────────────────────
  if (name === "get_adcp_capabilities") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              adcp: { major_versions: [3] },
              supported_protocols: ["media_buy"],
              media_buy: {
                portfolio: {
                  publisher_domains: ["david-five-kappa.vercel.app"],
                  primary_channels: ["display", "video", "native", "ctv"],
                  description: "Premium advertising inventory from David Ad Server",
                  advertising_policies: {
                    requires_brand_safety: false,
                    supports_iab_content_taxonomy: true,
                  },
                },
                features: {
                  content_standards: { iab_content_taxonomy: true },
                  creative_management: { hosted: false, vast: true },
                  property_filtering: { by_domain: true, by_channel: true },
                },
                execution: {
                  delivery_types: ["guaranteed", "non_guaranteed"],
                  pricing_models: ["cpm", "vcpm", "cpc", "flat_rate"],
                  currencies: ["USD", "GBP", "EUR"],
                },
              },
              targeting: {
                geo_countries: true,
                geo_regions: true,
                geo_metros: false,
                geo_postal: false,
                device_platform: true,
                audience_include: true,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // ── get_products ───────────────────────────────────────────────────────────
  if (name === "get_products") {
    const { brief, delivery_type, pricing_model, countries } =
      GetProductsArgs.parse(args);
    const catalog = await getActiveProducts();
    if (catalog.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { products: [], request_context: { brief: brief ?? "", policy_enforced: false } },
              null,
              2
            ),
          },
        ],
      };
    }
    let matched;
    try {
      matched = await matchProducts(brief ?? "", catalog, {
        deliveryType: delivery_type,
        pricingModel: pricing_model,
        countries,
      });
    } catch {
      const { buildAdcpProduct } = await import("@/lib/adcp");
      matched = catalog.map((p) => buildAdcpProduct(p));
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              products: matched,
              request_context: { brief: brief ?? "", policy_enforced: false },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // ── create_media_buy ───────────────────────────────────────────────────────
  if (name === "create_media_buy") {
    const parsed = CreateMediaBuyArgs.parse(args);

    const packages = parsed.packages?.length
      ? parsed.packages
      : parsed.product_id && parsed.pricing_option_id
      ? [
          {
            product_id: parsed.product_id,
            pricing_option_id: parsed.pricing_option_id,
            budget: parsed.budget,
            start_time: parsed.start_time,
            end_time: parsed.end_time,
          },
        ]
      : [];

    const { buyer_ref, start_time, end_time, total_budget } = parsed;

    if (!packages.length) {
      return adcpError("INVALID_REQUEST", "packages is required");
    }

    if (total_budget !== undefined && total_budget < 0) {
      return adcpError("BUDGET_TOO_LOW", "Budget cannot be negative");
    }
    for (const pkg of packages) {
      if (pkg.budget !== undefined && pkg.budget < 0) {
        return adcpError("BUDGET_TOO_LOW", "Package budget cannot be negative");
      }
    }

    const startStr = typeof start_time === "string" ? start_time : null;
    const endStr = typeof end_time === "string" ? end_time : null;
    if (startStr && endStr && new Date(endStr) <= new Date(startStr)) {
      return adcpError("INVALID_REQUEST", "end_time must be after start_time");
    }

    const catalog = await getActiveProducts();
    const validIds = new Set(catalog.map((p) => p.id));
    for (const pkg of packages) {
      if (!validIds.has(pkg.product_id)) {
        return adcpError("PRODUCT_NOT_FOUND", `Product not found: ${pkg.product_id}`);
      }
    }

    const db = getDb();
    const [row] = await db
      .insert(mediaBuys)
      .values({
        buyerRef: buyer_ref ?? null,
        packages,
        startTime: startStr ?? null,
        endTime: endStr ?? null,
        totalBudget: total_budget?.toString() ?? null,
        status: "active",
      })
      .returning();

    return {
      content: [
        { type: "text", text: JSON.stringify(formatMediaBuy(row), null, 2) },
      ],
    };
  }

  // ── update_media_buy ───────────────────────────────────────────────────────
  if (name === "update_media_buy") {
    const { media_buy_id, paused, canceled, total_budget, start_time, end_time } =
      UpdateMediaBuyArgs.parse(args);

    const db = getDb();
    const [existing] = await db
      .select()
      .from(mediaBuys)
      .where(eq(mediaBuys.id, media_buy_id))
      .limit(1);

    if (!existing) return adcpError("NOT_FOUND", `Media buy not found: ${media_buy_id}`);
    if (existing.status === "canceled") {
      return adcpError("CONFLICT", "Cannot update a canceled media buy");
    }

    let newStatus = existing.status;
    if (canceled) newStatus = "canceled";
    else if (paused === true) newStatus = "paused";
    else if (paused === false && existing.status === "paused") newStatus = "active";

    const startStr = typeof start_time === "string" ? start_time : existing.startTime;
    const endStr = typeof end_time === "string" ? end_time : existing.endTime;

    const [row] = await db
      .update(mediaBuys)
      .set({
        status: newStatus,
        totalBudget: total_budget?.toString() ?? existing.totalBudget,
        startTime: startStr,
        endTime: endStr,
      })
      .where(eq(mediaBuys.id, media_buy_id))
      .returning();

    return {
      content: [
        { type: "text", text: JSON.stringify(formatMediaBuy(row), null, 2) },
      ],
    };
  }

  // ── get_media_buy ──────────────────────────────────────────────────────────
  if (name === "get_media_buy") {
    const { media_buy_id } = GetMediaBuyArgs.parse(args);
    const db = getDb();
    const [row] = await db
      .select()
      .from(mediaBuys)
      .where(eq(mediaBuys.id, media_buy_id))
      .limit(1);

    if (!row) return adcpError("NOT_FOUND", `Media buy not found: ${media_buy_id}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ media_buys: [formatMediaBuy(row)] }, null, 2),
        },
      ],
    };
  }

  // ── get_media_buys ─────────────────────────────────────────────────────────
  if (name === "get_media_buys") {
    const { media_buy_ids } = GetMediaBuysArgs.parse(args);
    const db = getDb();

    const rows = media_buy_ids?.length
      ? await db.select().from(mediaBuys).where(inArray(mediaBuys.id, media_buy_ids))
      : await db.select().from(mediaBuys).limit(50);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              media_buys: rows.map(formatMediaBuy),
              aggregated_totals: { impressions: 0, spend: 0, clicks: 0 },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // ── get_media_buy_delivery ─────────────────────────────────────────────────
  if (name === "get_media_buy_delivery") {
    const { media_buy_ids } = GetMediaBuysArgs.parse(args);
    const db = getDb();

    const rows = media_buy_ids?.length
      ? await db.select().from(mediaBuys).where(inArray(mediaBuys.id, media_buy_ids))
      : await db.select().from(mediaBuys).limit(50);

    const delivery = rows.map((row) => ({
      media_buy_id: row.id,
      buyer_ref: row.buyerRef,
      status: row.status,
      metrics: { impressions: 0, spend: 0, clicks: 0, ctr: 0 },
    }));

    return {
      content: [
        { type: "text", text: JSON.stringify({ delivery }, null, 2) },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ── MCP dispatcher ─────────────────────────────────────────────────────────────

async function handleMcp(req: McpRequest): Promise<McpResponse> {
  const id = req.id ?? null;

  if (req.method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "Sales Agent MCP", version: "1.0.0" },
    });
  }

  if (req.method === "notifications/initialized" || req.method === "ping") {
    return ok(id, {});
  }

  if (req.method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }

  if (req.method === "tools/call") {
    const params = req.params ?? {};
    const name = params.name as string;
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    try {
      const result = await callTool(name, args);
      return ok(id, result);
    } catch (e) {
      return err(id, -32603, e instanceof Error ? e.message : String(e));
    }
  }

  return err(id, -32601, `Method not found: ${req.method}`);
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(err(null, -32700, "Parse error"), { status: 400 });
  }

  if (Array.isArray(body)) {
    const results = await Promise.all(
      body.map((item) => handleMcp(item as McpRequest))
    );
    return Response.json(results);
  }

  return Response.json(await handleMcp(body as McpRequest));
}

export async function GET(): Promise<Response> {
  return Response.json({
    name: "Sales Agent MCP",
    version: "1.0.0",
    description: "AdCP-compliant MCP server for advertising inventory",
    protocol_tracks: ["media_buy"],
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}
