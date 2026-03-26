import { getActiveProducts } from "@/lib/products";
import { matchProducts } from "@/lib/matcher";
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

// Tool definitions
const TOOLS = [
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
    name: "get_adcp_capabilities",
    description:
      "Returns the advertising capabilities of this publisher's MCP server.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

const GetProductsArgs = z.object({
  brief: z.string(),
  delivery_type: z.enum(["guaranteed", "non_guaranteed"]).optional(),
  pricing_model: z.string().optional(),
  countries: z.array(z.string()).optional(),
});

async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (name === "get_products") {
    const { brief, delivery_type, pricing_model, countries } =
      GetProductsArgs.parse(args);
    const catalog = await getActiveProducts();
    const matched = await matchProducts(brief, catalog, {
      deliveryType: delivery_type,
      pricingModel: pricing_model,
      countries,
    });
    return {
      content: [
        { type: "text", text: JSON.stringify({ products: matched }, null, 2) },
      ],
    };
  }

  if (name === "get_adcp_capabilities") {
    const capabilities = {
      adcp: { version: "2.5", compliance: "full" },
      supported_protocols: ["mcp"],
      media_buy: {
        delivery_types: ["guaranteed", "non_guaranteed"],
        pricing_models: ["cpm", "vcpm", "cpc", "flat_rate"],
        currencies: ["USD", "GBP", "EUR"],
      },
      targeting: { geo: true, device: true, contextual: true, audience: true },
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
      capabilities_summary: [
        "Homepage takeover and high-impact display",
        "Video pre-roll (VAST 4.0, desktop + mobile + CTV)",
        "Native in-feed and sponsored content",
        "First-party audience targeting",
        "Newsletter sponsorships",
        "Contextual display (cookie-free)",
      ],
    };
    return {
      content: [
        { type: "text", text: JSON.stringify(capabilities, null, 2) },
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

  if (
    req.method === "notifications/initialized" ||
    req.method === "ping"
  ) {
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
    return Response.json(
      err(null, -32700, "Parse error"),
      { status: 400 }
    );
  }

  // Handle batch requests
  if (Array.isArray(body)) {
    const results = await Promise.all(
      body.map((item) => handleMcp(item as McpRequest))
    );
    return Response.json(results);
  }

  const response = await handleMcp(body as McpRequest);
  return Response.json(response);
}

// MCP discovery endpoint
export async function GET(): Promise<Response> {
  return Response.json({
    name: "Sales Agent MCP",
    version: "1.0.0",
    description: "AdCP-compliant MCP server for advertising inventory",
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}
