export const metadata = {
  title: "Sales Agent MCP",
  description: "AdCP-compliant MCP server for advertising inventory",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
