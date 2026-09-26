/** A minimal MCP server using the official TypeScript/Node SDK over stdio. */

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

function createServer() {
  // #region server-identity
  // This name and version identify the server to an MCP client.
  const server = new McpServer({ name: "cab432-temperature-tools", version: "1.0.0" });
  // #endregion server-identity
  // #region temperature-tool
  server.registerTool(
    "celsius_to_fahrenheit",
    {
      description: "Convert a Celsius temperature to Fahrenheit.",
      // Zod validates that the client supplies a numeric Celsius value.
      inputSchema: z.object({ celsius: z.number().describe("Temperature in Celsius") }),
    },
    async ({ celsius }) => ({
      content: [{ type: "text", text: `${celsius.toFixed(1)}°C is ${((celsius * 9) / 5 + 32).toFixed(1)}°F` }],
    }),
  );
  // #endregion temperature-tool
  return server;
}

// #region stdio-transport
// Serve the registered tools over standard input/output for a local MCP client.
void serveStdio(createServer);
// Standard error is safe for status messages; standard output is the protocol.
console.error("CAB432 temperature MCP server running on stdio");
// #endregion stdio-transport
