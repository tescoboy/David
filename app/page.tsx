import productsData from "@/data/products.json";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const products = productsData;
  const agentName = process.env.AGENT_NAME || "Prebid Sales Agent";
  const publisherDomain = process.env.PUBLISHER_DOMAIN || "salesagent.example.com";

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa" }}>
      {/* Header */}
      <header
        style={{
          background: "#1a1a2e",
          color: "white",
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: "#e94560",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          📡
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{agentName}</h1>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
            AdCP Sales Agent · {publisherDomain}
          </p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span
            style={{
              background: "#00b894",
              color: "white",
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ● Online
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {/* Connection Info */}
        <section
          style={{
            background: "white",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
            border: "1px solid #e9ecef",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>
            Connect to this agent
          </h2>
          <p style={{ margin: "0 0 16px", color: "#555", fontSize: 14 }}>
            This sales agent exposes an MCP endpoint compatible with the Ad Context Protocol (AdCP).
            Connect any AdCP-compliant buying agent using the details below.
          </p>
          <div
            style={{
              background: "#f8f9fa",
              borderRadius: 8,
              padding: 16,
              fontFamily: "monospace",
              fontSize: 13,
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <strong>MCP Endpoint:</strong>{" "}
              <code
                style={{
                  background: "#e9ecef",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                POST /api/mcp
              </code>
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Health Check:</strong>{" "}
              <code
                style={{
                  background: "#e9ecef",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                GET /api/health
              </code>
            </div>
            <div>
              <strong>Auth:</strong>{" "}
              <code
                style={{
                  background: "#e9ecef",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                Authorization: Bearer &lt;your-token&gt;
              </code>
            </div>
          </div>
        </section>

        {/* Available Tools */}
        <section
          style={{
            background: "white",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
            border: "1px solid #e9ecef",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>
            Available MCP tools
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              {
                name: "get_adcp_capabilities",
                desc: "Returns agent capabilities, supported channels, and targeting options.",
                badge: "info",
              },
              {
                name: "get_products",
                desc: "Finds ad products matching a campaign brief. Supports channel and device filters.",
                badge: "query",
              },
              {
                name: "create_media_buy",
                desc: "Creates a media buy order for one or more products.",
                badge: "write",
              },
              {
                name: "get_media_buy",
                desc: "Retrieves the status and details of an existing media buy.",
                badge: "query",
              },
              {
                name: "update_media_buy",
                desc: "Updates a media buy (cancel, pause, or change dates/budget).",
                badge: "write",
              },
            ].map((tool) => (
              <div
                key={tool.name}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 16px",
                  background: "#f8f9fa",
                  borderRadius: 8,
                  border: "1px solid #e9ecef",
                }}
              >
                <code
                  style={{
                    background:
                      tool.badge === "write"
                        ? "#fff3cd"
                        : tool.badge === "query"
                        ? "#cce5ff"
                        : "#d4edda",
                    color:
                      tool.badge === "write"
                        ? "#856404"
                        : tool.badge === "query"
                        ? "#004085"
                        : "#155724",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: "nowrap" as const,
                    flexShrink: 0,
                  }}
                >
                  {tool.name}
                </code>
                <span style={{ fontSize: 13, color: "#555" }}>{tool.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Products */}
        <section
          style={{
            background: "white",
            borderRadius: 12,
            padding: 24,
            border: "1px solid #e9ecef",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600 }}>
            Ad products ({products.length})
          </h2>
          <p style={{ margin: "0 0 20px", color: "#888", fontSize: 13 }}>
            Products are configurable via the PRODUCTS_JSON environment variable.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {products.map((product) => {
              // Type assertion for product from JSON
              const p = product as typeof product & {
                product_id: string;
                name: string;
                description: string;
                channels: string[];
                delivery_type: string;
                pricing_options: Array<{
                  pricing_model: string;
                  price_guidance?: { p50?: number };
                  currency?: string;
                }>;
              };
              const cpm = p.pricing_options?.[0]?.price_guidance?.p50;
              return (
                <div
                  key={p.product_id}
                  style={{
                    padding: "16px",
                    background: "#f8f9fa",
                    borderRadius: 8,
                    border: "1px solid #e9ecef",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 6,
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 14 }}>{p.name}</strong>
                      <code
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          background: "#e9ecef",
                          padding: "1px 6px",
                          borderRadius: 4,
                          color: "#666",
                        }}
                      >
                        {p.product_id}
                      </code>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {p.channels.map((ch: string) => (
                        <span
                          key={ch}
                          style={{
                            background: "#e3f2fd",
                            color: "#1565c0",
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {ch}
                        </span>
                      ))}
                      <span
                        style={{
                          background:
                            p.delivery_type === "guaranteed"
                              ? "#e8f5e9"
                              : "#fff3e0",
                          color:
                            p.delivery_type === "guaranteed"
                              ? "#2e7d32"
                              : "#e65100",
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {p.delivery_type}
                      </span>
                    </div>
                  </div>
                  <p style={{ margin: "0 0 6px", fontSize: 13, color: "#555" }}>
                    {p.description}
                  </p>
                  {cpm !== undefined && (
                    <span style={{ fontSize: 12, color: "#888" }}>
                      ~${cpm.toFixed(2)} CPM (p50)
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer
        style={{
          textAlign: "center",
          padding: "24px",
          color: "#aaa",
          fontSize: 12,
        }}
      >
        Prebid Sales Agent · AdCP v3 · Built on Next.js
      </footer>
    </div>
  );
}
