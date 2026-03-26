export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 600 }}>
      <h1>Sales Agent MCP Server</h1>
      <p>MCP endpoint: <code>/api/mcp</code></p>
      <h2>Available tools</h2>
      <ul>
        <li><strong>get_products</strong> — match a brief to ad products</li>
        <li><strong>get_adcp_capabilities</strong> — publisher capabilities</li>
      </ul>
      <h2>Test it</h2>
      <pre style={{ background: "#f4f4f4", padding: "1rem", borderRadius: 4, overflowX: "auto" }}>
        {`uvx adcp https://<your-domain>/api/mcp \\
  get_products '{"brief":"video ads for a sports brand"}'`}
      </pre>
    </main>
  );
}
