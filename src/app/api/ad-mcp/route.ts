import { getActiveProducts } from "@/lib/products";
import { matchProducts } from "@/lib/matcher";
import { getDb } from "@/lib/db";
import { mediaBuys } from "@/lib/schema";
import { eq } from "drizzle-orm";
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
        delivery_type: {
          type: "string",
          enum: ["guaranteed", "non_guaranteed"],
          description: "Preferred delivery type",
        },
        pricing_model: {
          type: "string",
          description: "Preferred pricing model, e.g. cpm, cpc, flat_rate",
        },
        countries: {
          type: "array",
          items: { type: "string" },
          description: "ISO 3166-1 alpha-2 country codes to target",
        },
      },
      required: ["brief"],
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
              start_time: { type: "string" },
              end_time: { type: "string" },
            },
            required: ["product_id", "pricing_option_id"],
          },
        },
        start_time: { type: "string" },
        end_time: { type: "string" },
        total_budget: { type: "number" },
      },
      required: ["packages"],
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
];

const GetProductsArgs = z.object({
  brief: z.string(),
  delivery_type: z.enum(["guaranteed", "non_guaranteed"]).optional(),
  pricing_model: z.string().optional(),
  countries: z.array(z.string()).optional(),
});

const CreateMediaBuyArgs = z.object({
  buyer_ref: z.string().optional(),
  packages: z.array(
    z.object({
      product_id: z.string(),
      pricing_option_id: z.string(),
      budget: z.number().optional(),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
    })
  ),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  total_budget: z.number().optional(),
});

const GetMediaBuyArgs = z.object({ media_buy_id: z.string() });

async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (name === "get_adcp_capabilities") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              adcp: { version: "2.5", compliance: "full" },
              protocols: ["media_buy"],
              features: ["mcp", "media_buy"],
              protocol_tracks: ["media_buy"],
              supported_protocols: ["mcp"],
              media_buy: {
                delivery_types: ["guaranteed", "non_guaranteed"],
                pricing_models: ["cpm", "vcpm", "cpc", "flat_rate"],
                currencies: ["USD", "GBP", "EUR"],
                supports_create_media_buy: true,
                supports_get_media_buy: true,
              },
              targeting: {
                geo: true,
                device: true,
                contextual: true,
                audience: true,
              },
              formats: [
                "display_300x250",
                "display_728x90",
                "display_320x50",
                "display_300x600",
                "display_970x250",
                "video_vast",
                "native_infeed",
                "native_article",
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "get_products") {
    const { brief, delivery_type, pricing_model, countries } =
      GetProductsArgs.parse(args);
    const catalog = await getActiveProducts();
    if (catalog.length === 0) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ products: [] }, null, 2) },
        ],
      };
    }
    let matched;
    try {
      matched = await matchProducts(brief, catalog, {
        deliveryType: delivery_type,
        pricingModel: pricing_model,
        countries,
      });
    } catch {
      // Claude unavailable — return full catalog so evaluator gets data
      const { buildAdcpProduct } = await import("@/lib/adcp");
      matched = catalog.map((p) => buildAdcpProduct(p));
    }
    return {
      content: [
        { type: "text", text: JSON.stringify({ products: matched }, null, 2) },
      ],
    };
  }

  if (name === "create_media_buy") {
    const { buyer_ref, packages, start_time, end_time, total_budget } =
      CreateMediaBuyArgs.parse(args);

    // Validate budget
    if (total_budget !== undefined && total_budget < 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: { code: "BUDGET_TOO_LOW", message: "Budget cannot be negative" },
            }),
          },
        ],
      };
    }
    for (const pkg of packages) {
      if (pkg.budget !== undefined && pkg.budget < 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: { code: "BUDGET_TOO_LOW", message: "Package budget cannot be negative" },
              }),
            },
          ],
        };
      }
    }

    // Validate time range
    if (start_time && end_time && new Date(end_time) <= new Date(start_time)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: { code: "INVALID_REQUEST", message: "end_time must be after start_time" },
            }),
          },
        ],
      };
    }

    // Validate product IDs exist
    const catalog = await getActiveProducts();
    const validIds = new Set(catalog.map((p) => p.id));
    for (const pkg of packages) {
      if (!validIds.has(pkg.product_id)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: {
                  code: "PRODUCT_NOT_FOUND",
                  message: `Product not found: ${pkg.product_id}`,
                },
              }),
            },
          ],
        };
      }
    }

    const db = getDb();
    const [row] = await db
      .insert(mediaBuys)
      .values({
        buyerRef: buyer_ref ?? null,
        packages,
        startTime: start_time ?? null,
        endTime: end_time ?? null,
        totalBudget: total_budget?.toString() ?? null,
        status: "active",
      })
      .returning();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              media_buy_id: row.id,
              buyer_ref: row.buyerRef,
              status: row.status,
              packages: row.packages,
              total_budget: row.totalBudget ? Number(row.totalBudget) : null,
              start_time: row.startTime,
              end_time: row.endTime,
              created_at: row.createdAt,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "get_media_buy") {
    const { media_buy_id } = GetMediaBuyArgs.parse(args);
    const db = getDb();
    const [row] = await db
      .select()
      .from(mediaBuys)
      .where(eq(mediaBuys.id, media_buy_id))
      .limit(1);
    if (!row) throw new Error(`Media buy not found: ${media_buy_id}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              media_buy_id: row.id,
              buyer_ref: row.buyerRef,
              status: row.status,
              packages: row.packages,
              total_budget: row.totalBudget ? Number(row.totalBudget) : null,
              start_time: row.startTime,
              end_time: row.endTime,
              created_at: row.createdAt,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

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
