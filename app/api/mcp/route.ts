/**
 * MCP (Model Context Protocol) endpoint implementing the Streamable HTTP transport.
 * Exposes AdCP tools: get_adcp_capabilities, get_products, create_media_buy,
 * get_media_buy, and update_media_buy.
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * Auth: Bearer token (Authorization header) or x-adcp-auth header
 *
 * Spec: https://spec.modelcontextprotocol.io
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdcpCapabilities } from "@/lib/tools/capabilities";
import { getProducts } from "@/lib/products";
import {
  createMediaBuy,
  fetchMediaBuy,
  patchMediaBuy,
} from "@/lib/tools/media-buy";
import type { McpRequest, McpResponse, McpTool } from "@/lib/types";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = process.env.AGENT_NAME || "Prebid Sales Agent";
const SERVER_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function extractToken(req: NextRequest): string | null {
  // x-adcp-auth takes priority (AdCP convention)
  const xAdcp = req.headers.get("x-adcp-auth");
  if (xAdcp?.trim()) return xAdcp.trim();

  // Authorization: Bearer <token>
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  return null;
}

function isAuthorized(token: string | null): boolean {
  const validTokens = process.env.AUTH_TOKENS;
  if (!validTokens) {
    // No auth configured — allow all (useful for testing)
    return true;
  }
  if (!token) return false;
  return validTokens.split(",").map((t) => t.trim()).includes(token);
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-adcp-auth, Mcp-Session-Id, Accept",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ---------------------------------------------------------------------------
// Tool definitions (MCP schema)
// ---------------------------------------------------------------------------

const TOOLS: McpTool[] = [
  {
    name: "get_adcp_capabilities",
    description:
      "Get the capabilities of this AdCP sales agent. Returns supported protocols, " +
      "available channels, targeting capabilities, and portfolio information.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_products",
    description:
      "Get advertising products available from this publisher. Returns a list of products " +
      "matching the provided brief and filters. Use this to discover available ad inventory " +
      "before creating a media buy.",
    inputSchema: {
      type: "object",
      properties: {
        brief: {
          type: "string",
          description:
            "Natural language description of the advertising campaign goals, " +
            "target audience, and desired formats. E.g. 'video ads targeting sports fans in the US'.",
        },
        brand: {
          type: "object",
          description: "Brand/advertiser information",
          properties: {
            domain: { type: "string", description: "Advertiser's domain, e.g. 'nike.com'" },
            brand_id: { type: "string", description: "Optional brand identifier" },
          },
        },
        filters: {
          type: "object",
          description: "Optional filters to narrow down products",
          properties: {
            channels: {
              type: "array",
              items: { type: "string" },
              description:
                "Filter by channels: display, olv, ctv, streaming_audio, social, search",
            },
            delivery_type: {
              type: "string",
              enum: ["auction", "guaranteed"],
              description: "Filter by delivery type",
            },
            device_types: {
              type: "array",
              items: { type: "string" },
              description: "Filter by device type: desktop, mobile, tablet, ctv",
            },
          },
        },
      },
      required: [],
    },
  },
  {
    name: "create_media_buy",
    description:
      "Create a media buy order for one or more advertising products. " +
      "Returns a media_buy_id you can use to track the order status.",
    inputSchema: {
      type: "object",
      properties: {
        buyer_ref: {
          type: "string",
          description: "Buyer's unique reference ID for this order (your internal order ID).",
        },
        brand: {
          type: "object",
          description: "Brand/advertiser information",
          properties: {
            domain: { type: "string" },
          },
        },
        packages: {
          type: "array",
          description: "List of products to purchase",
          items: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description: "Product ID from get_products response",
              },
              budget: {
                type: "object",
                properties: {
                  amount: { type: "number" },
                  currency: { type: "string", default: "USD" },
                },
                required: ["amount", "currency"],
              },
              impressions: {
                type: "number",
                description: "Target impression count",
              },
            },
            required: ["product_id"],
          },
          minItems: 1,
        },
        start_time: {
          type: "string",
          description: "Campaign start time in ISO 8601 format",
        },
        end_time: {
          type: "string",
          description: "Campaign end time in ISO 8601 format",
        },
        budget: {
          type: "object",
          description: "Total campaign budget",
          properties: {
            amount: { type: "number" },
            currency: { type: "string", default: "USD" },
          },
        },
        po_number: {
          type: "string",
          description: "Purchase order number for billing",
        },
      },
      required: ["buyer_ref", "packages"],
    },
  },
  {
    name: "get_media_buy",
    description: "Get the current status and details of a media buy order.",
    inputSchema: {
      type: "object",
      properties: {
        media_buy_id: {
          type: "string",
          description: "Media buy ID returned by create_media_buy",
        },
      },
      required: ["media_buy_id"],
    },
  },
  {
    name: "update_media_buy",
    description:
      "Update the status or details of an existing media buy order. " +
      "Can be used to cancel, pause, or resume a campaign.",
    inputSchema: {
      type: "object",
      properties: {
        media_buy_id: {
          type: "string",
          description: "Media buy ID to update",
        },
        status: {
          type: "string",
          enum: ["pending", "approved", "cancelled", "paused", "active"],
          description: "New status for the media buy",
        },
        start_time: {
          type: "string",
          description: "Updated campaign start time (ISO 8601)",
        },
        end_time: {
          type: "string",
          description: "Updated campaign end time (ISO 8601)",
        },
        budget: {
          type: "object",
          properties: {
            amount: { type: "number" },
            currency: { type: "string" },
          },
        },
      },
      required: ["media_buy_id"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

type ToolArgs = Record<string, unknown>;

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// Map error messages to AdCP error codes
function classifyError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes("not found")) return "NOT_FOUND";
  if (msg.includes("required") || msg.includes("missing")) return "INVALID_REQUEST";
  if (msg.includes("invalid") || msg.includes("bad")) return "VALIDATION_ERROR";
  if (msg.includes("unauthorized") || msg.includes("auth")) return "UNAUTHORIZED";
  return "INTERNAL_ERROR";
}

function adcpError(message: string, recovery?: string): ToolResult {
  const error_code = classifyError(message);
  const defaultRecovery: Record<string, string> = {
    NOT_FOUND: "Check the ID is correct. Use get_products or get_media_buy to look up valid IDs.",
    INVALID_REQUEST: "Check all required fields are present and correctly formatted.",
    VALIDATION_ERROR: "Review the input values and correct any invalid fields.",
    UNAUTHORIZED: "Provide a valid auth token in the Authorization header.",
    INTERNAL_ERROR: "An unexpected error occurred. Please retry.",
  };
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error_code,
          message,
          recovery: recovery ?? defaultRecovery[error_code],
          details: null,
        }),
      },
    ],
  };
}

function dispatchTool(name: string, args: ToolArgs): ToolResult {
  try {
    switch (name) {
      case "get_adcp_capabilities": {
        const caps = getAdcpCapabilities();
        return {
          content: [{ type: "text", text: JSON.stringify(caps) }],
        };
      }

      case "get_products": {
        const products = getProducts({
          brief: args.brief as string | undefined,
          brand: args.brand as { domain?: string } | undefined,
          filters: args.filters as
            | {
                channels?: string[];
                delivery_type?: string;
                device_types?: string[];
              }
            | undefined,
        });
        // Return a clean JSON object — no text preamble so parsers can JSON.parse directly
        return {
          content: [{ type: "text", text: JSON.stringify({ products }) }],
        };
      }

      case "create_media_buy": {
        if (!args.buyer_ref) {
          return adcpError("buyer_ref is required", "Provide a unique buyer_ref string to identify this order.");
        }
        if (!args.packages || !Array.isArray(args.packages) || (args.packages as unknown[]).length === 0) {
          return adcpError("packages is required and must contain at least one item", "Provide an array of packages, each with a product_id.");
        }
        const result = createMediaBuy({
          buyer_ref: args.buyer_ref as string,
          brand: args.brand as { domain?: string } | undefined,
          packages: args.packages as Array<{
            product_id: string;
            budget?: { amount: number; currency: string };
            impressions?: number;
          }>,
          start_time: args.start_time as string | undefined,
          end_time: args.end_time as string | undefined,
          budget: args.budget as { amount: number; currency: string } | undefined,
          po_number: args.po_number as string | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }

      case "get_media_buy": {
        if (!args.media_buy_id) {
          return adcpError("media_buy_id is required");
        }
        const buy = fetchMediaBuy(args.media_buy_id as string);
        return {
          content: [{ type: "text", text: JSON.stringify(buy) }],
        };
      }

      case "update_media_buy": {
        if (!args.media_buy_id) {
          return adcpError("media_buy_id is required");
        }
        const updated = patchMediaBuy(args.media_buy_id as string, {
          status: args.status as string | undefined,
          start_time: args.start_time as string | undefined,
          end_time: args.end_time as string | undefined,
          budget: args.budget as { amount: number; currency: string } | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(updated) }],
        };
      }

      default:
        return adcpError(`Unknown tool: ${name}`, "Call tools/list to see available tools.");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return adcpError(message);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC message handler
// ---------------------------------------------------------------------------

function handleMessage(req: McpRequest): McpResponse {
  const { id, method, params = {} } = req;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION,
            },
          },
        };

      case "notifications/initialized":
        // Client sends this after initialize — no response needed
        return { jsonrpc: "2.0", id: null, result: null };

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOLS,
          },
        };

      case "tools/call": {
        const toolName = params.name as string;
        const toolArgs = (params.arguments || {}) as ToolArgs;

        if (!toolName) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Missing tool name" },
          };
        }

        // dispatchTool never throws — errors are returned as AdCP error objects
        // with isError:true so the evaluator receives structured responses
        const toolResult = dispatchTool(toolName, toolArgs);
        return { jsonrpc: "2.0", id, result: toolResult };
      }

      case "resources/list":
        return { jsonrpc: "2.0", id, result: { resources: [] } };

      case "prompts/list":
        return { jsonrpc: "2.0", id, result: { prompts: [] } };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = extractToken(req);

  if (!isAuthorized(token)) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid auth token required" },
      { status: 401, headers: corsHeaders }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: invalid JSON" },
      },
      { status: 400, headers: corsHeaders }
    );
  }

  // Handle batch requests (array of JSON-RPC messages)
  if (Array.isArray(body)) {
    const responses = body
      .map((msg) => handleMessage(msg as McpRequest))
      .filter((r) => r.id !== null); // Notifications get no response
    return NextResponse.json(responses, { headers: corsHeaders });
  }

  // Single request
  const response = handleMessage(body as McpRequest);

  // Notifications (no id) get 204 No Content
  if (response.id === null && (body as McpRequest).id === undefined) {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  return NextResponse.json(response, { headers: corsHeaders });
}

// Support GET for SSE-based clients (legacy MCP transport)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = extractToken(req);
  if (!isAuthorized(token)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  // Return a minimal SSE stream that immediately signals the endpoint is alive
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", server: SERVER_NAME })}\n\n`
        )
      );
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
