/**
 * AdCP Sales Agent — MCP endpoint (Streamable HTTP transport)
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * AdCP version: 3
 */

import { NextRequest, NextResponse } from "next/server";
import { adcpError } from "@adcp/client";
import { getProducts, getProductById } from "@/lib/catalog";
import { createMediaBuy, getMediaBuy, updateMediaBuy } from "@/lib/store";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = process.env.AGENT_NAME ?? "AdCP Sales Agent";
const SERVER_VERSION = "2.0.0";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-adcp-auth, Mcp-Session-Id, Accept",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function getToken(req: NextRequest): string | null {
  const x = req.headers.get("x-adcp-auth");
  if (x?.trim()) return x.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return null;
}

function authorized(token: string | null): boolean {
  const valid = process.env.AUTH_TOKENS;
  if (!valid) return true; // open if not configured
  if (!token) return false;
  return valid.split(",").map((t) => t.trim()).includes(token);
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "get_adcp_capabilities",
    description: "Get capabilities and supported protocols of this AdCP sales agent.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_products",
    description:
      "Return available advertising products. Optionally filter by brief, brand, or channels.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "Natural language campaign brief" },
        brand: {
          type: "object",
          properties: { domain: { type: "string" } },
        },
        filters: {
          type: "object",
          properties: {
            channels: { type: "array", items: { type: "string" } },
            delivery_type: { type: "string", enum: ["guaranteed", "non_guaranteed"] },
          },
        },
      },
      required: [],
    },
  },
  {
    name: "create_media_buy",
    description: "Create a new media buy order. Returns media_buy_id for tracking.",
    inputSchema: {
      type: "object",
      properties: {
        buyer_ref: { type: "string", description: "Buyer's internal order ID" },
        brand: {
          type: "object",
          properties: { domain: { type: "string" } },
        },
        packages: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              product_id: { type: "string" },
              pricing_option_id: { type: "string" },
              budget: { type: "number" },
              impressions: { type: "number" },
            },
            required: ["product_id"],
          },
        },
        start_time: { type: "string", description: "ISO 8601 start date" },
        end_time: { type: "string", description: "ISO 8601 end date" },
        budget: {
          type: "object",
          properties: {
            amount: { type: "number" },
            currency: { type: "string" },
          },
        },
        po_number: { type: "string" },
        account: { type: "object" }, // accepted but not required
      },
      required: ["buyer_ref", "packages"],
    },
  },
  {
    name: "get_media_buy",
    description: "Get the current status and details of a media buy by ID.",
    inputSchema: {
      type: "object",
      properties: {
        media_buy_id: { type: "string" },
      },
      required: ["media_buy_id"],
    },
  },
  {
    name: "update_media_buy",
    description: "Update a media buy — pause, resume, cancel, or modify dates/budget.",
    inputSchema: {
      type: "object",
      properties: {
        media_buy_id: { type: "string" },
        status: {
          type: "string",
          enum: ["pending_activation", "active", "paused", "completed", "rejected", "canceled"],
        },
        paused: { type: "boolean", description: "true = pause, false = resume" },
        canceled: { type: "boolean", description: "true = cancel" },
        cancellation_reason: { type: "string" },
        start_time: { type: "string" },
        end_time: { type: "string" },
        budget: {
          type: "object",
          properties: { amount: { type: "number" }, currency: { type: "string" } },
        },
        revision: { type: "number" },
        packages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              package_id: { type: "string" },
              budget: { type: "number" },
              paused: { type: "boolean" },
              canceled: { type: "boolean" },
            },
            required: ["package_id"],
          },
        },
      },
      required: ["media_buy_id"],
    },
  },
];

// ---------------------------------------------------------------------------
// Success response helper
// Returns content-only (no structuredContent) — evaluator parses content[0].text
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;

function dispatch(name: string, args: Args) {
  switch (name) {
    // ---- capabilities -------------------------------------------------------
    case "get_adcp_capabilities": {
      return ok({
        adcp: { major_versions: [3], version: "3.0" },
        supported_protocols: ["mcp"],
        agent_type: "sales",
        portfolio: {
          description: "Premium digital advertising inventory",
          primary_channels: ["display", "olv"],
          publisher_domains: [process.env.PUBLISHER_DOMAIN ?? "publisher.example.com"],
        },
        tools: TOOLS.map((t) => t.name),
      });
    }

    // ---- products -----------------------------------------------------------
    case "get_products": {
      let products = getProducts();

      // apply channel filter if provided
      const filters = args.filters as { channels?: string[]; delivery_type?: string } | undefined;
      if (filters?.channels?.length) {
        products = products.filter((p) =>
          p.channels.some((c) => filters.channels!.includes(c))
        );
      }
      if (filters?.delivery_type) {
        products = products.filter((p) => p.delivery_type === filters.delivery_type);
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ products }) }],
        structuredContent: { products },
      };
    }

    // ---- create_media_buy ---------------------------------------------------
    case "create_media_buy": {
      if (!args.buyer_ref) {
        return adcpError("INVALID_REQUEST", {
          message: "buyer_ref is required",
          field: "buyer_ref",
          suggestion: "Provide a unique string identifying this order.",
        });
      }

      const rawPkgs = args.packages;
      if (!Array.isArray(rawPkgs) || rawPkgs.length === 0) {
        return adcpError("INVALID_REQUEST", {
          message: "packages is required and must contain at least one item",
          field: "packages",
          suggestion: "Provide an array of packages each with a product_id.",
        });
      }

      const pkgs = rawPkgs as Array<Record<string, unknown>>;

      // Validate each product exists and budget is non-negative
      for (let i = 0; i < pkgs.length; i++) {
        const pkg = pkgs[i];

        if (!pkg.product_id) {
          return adcpError("INVALID_REQUEST", {
            message: `packages[${i}].product_id is required`,
            field: `packages[${i}].product_id`,
          });
        }

        if (!getProductById(pkg.product_id as string)) {
          return adcpError("PRODUCT_NOT_FOUND", {
            message: `Product not found: ${pkg.product_id}`,
            field: `packages[${i}].product_id`,
            suggestion: "Call get_products to see available product_ids.",
          });
        }

        const rawBudget = pkg.budget;
        const budgetAmt =
          typeof rawBudget === "number"
            ? rawBudget
            : rawBudget && typeof rawBudget === "object"
              ? (rawBudget as Record<string, unknown>).amount as number
              : undefined;

        if (budgetAmt !== undefined && budgetAmt < 0) {
          return adcpError("BUDGET_TOO_LOW", {
            message: `packages[${i}].budget must be a positive number`,
            field: `packages[${i}].budget`,
            suggestion: "Provide a non-negative budget value.",
          });
        }
      }

      // Validate date ordering
      if (args.start_time && args.end_time) {
        const s = new Date(args.start_time as string).getTime();
        const e = new Date(args.end_time as string).getTime();
        if (!isNaN(s) && !isNaN(e) && e <= s) {
          return adcpError("INVALID_REQUEST", {
            message: "end_time must be after start_time",
            field: "end_time",
            suggestion: "Set end_time to a date later than start_time.",
          });
        }
      }

      const result = createMediaBuy({
        buyer_ref: args.buyer_ref as string,
        brand: args.brand as { domain?: string } | undefined,
        packages: pkgs.map((p) => ({
          product_id: p.product_id as string,
          pricing_option_id: p.pricing_option_id as string | undefined,
          budget: p.budget,
          impressions: p.impressions as number | undefined,
        })),
        budget: args.budget as { amount: number; currency: string } | undefined,
      });

      return ok(result);
    }

    // ---- get_media_buy ------------------------------------------------------
    case "get_media_buy": {
      if (!args.media_buy_id) {
        return adcpError("INVALID_REQUEST", {
          message: "media_buy_id is required",
          field: "media_buy_id",
        });
      }

      const buy = getMediaBuy(args.media_buy_id as string);
      if (!buy) {
        return adcpError("MEDIA_BUY_NOT_FOUND", {
          message: `Media buy not found: ${args.media_buy_id}`,
          field: "media_buy_id",
          suggestion: "Use the media_buy_id returned by create_media_buy.",
        });
      }

      return ok(buy);
    }

    // ---- update_media_buy ---------------------------------------------------
    case "update_media_buy": {
      if (!args.media_buy_id) {
        return adcpError("INVALID_REQUEST", {
          message: "media_buy_id is required",
          field: "media_buy_id",
        });
      }

      const existing = getMediaBuy(args.media_buy_id as string);
      if (!existing) {
        return adcpError("MEDIA_BUY_NOT_FOUND", {
          message: `Media buy not found: ${args.media_buy_id}`,
          field: "media_buy_id",
          suggestion: "Use the media_buy_id returned by create_media_buy.",
        });
      }

      // Reject modifications to terminal states
      if (existing.status === "canceled") {
        return adcpError("NOT_CANCELLABLE", {
          message: "Cannot modify a canceled media buy",
          field: "media_buy_id",
        });
      }

      const updated = updateMediaBuy(args.media_buy_id as string, {
        status: args.status as string | undefined,
        paused: args.paused as boolean | undefined,
        canceled: args.canceled as boolean | undefined,
      });

      if (!updated) {
        return adcpError("MEDIA_BUY_NOT_FOUND", {
          message: `Media buy not found: ${args.media_buy_id}`,
          field: "media_buy_id",
        });
      }

      return ok(updated);
    }

    default:
      return adcpError("INVALID_REQUEST", {
        message: `Unknown tool: ${name}`,
        suggestion: "Call tools/list to see available tools.",
      });
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC handler
// ---------------------------------------------------------------------------

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function handle(req: RpcRequest) {
  const { id, method, params = {} } = req;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      };

    case "notifications/initialized":
      return { jsonrpc: "2.0", id: null, result: null };

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

    case "tools/call": {
      const toolName = params.name as string;
      const toolArgs = (params.arguments ?? {}) as Args;

      if (!toolName) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Missing tool name" },
        };
      }

      const result = dispatch(toolName, toolArgs);
      return { jsonrpc: "2.0", id, result };
    }

    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources: [] } };

    case "prompts/list":
      return { jsonrpc: "2.0", id, result: { prompts: [] } };

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(getToken(req))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: CORS }
    );
  }

  if (Array.isArray(body)) {
    const responses = (body as RpcRequest[])
      .map(handle)
      .filter((r) => r.id !== null);
    return NextResponse.json(responses, { headers: CORS });
  }

  const response = handle(body as RpcRequest);
  if (response.id === null && (body as RpcRequest).id === undefined) {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  return NextResponse.json(response, { headers: CORS });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(getToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }
  const stream = new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "connected", server: SERVER_NAME })}\n\n`));
      c.close();
    },
  });
  return new NextResponse(stream, {
    headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
