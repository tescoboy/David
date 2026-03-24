import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "prebid-salesagent",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      mcp: "/api/mcp",
      health: "/api/health",
    },
  });
}
