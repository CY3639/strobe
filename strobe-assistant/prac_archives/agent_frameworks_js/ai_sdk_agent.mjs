/** Chat with a ToolLoopAgent that can call a local MCP server. */

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Use the configured region, defaulting to the unit's Sydney region.
const region = process.env.AWS_REGION ?? "ap-southeast-2";
const modelId = "nvidia.nemotron-super-3-120b";
// The MCP practical is extracted beside this directory.
const mcpServerPath = fileURLToPath(new URL("../mcp_servers_js/mcp_server.mjs", import.meta.url));

// Use the standard Node AWS credential provider chain rather than hard-coded keys.
const bedrock = createAmazonBedrock({
  region,
  credentialProvider: fromNodeProviderChain(),
});
// Start the local MCP server and complete the MCP initialization handshake.
const mcpClient = new Client({ name: "cab432-agent", version: "1.0.0" });
await mcpClient.connect(new StdioClientTransport({
  command: process.execPath,
  args: [mcpServerPath],
}));
const { tools: discoveredTools } = await mcpClient.listTools();
if (!discoveredTools.some(({ name }) => name === "celsius_to_fahrenheit")) {
  throw new Error("The MCP server did not provide celsius_to_fahrenheit.");
}

// Adapt the discovered MCP tool so ToolLoopAgent can execute it in its tool loop.
const tools = {
  celsius_to_fahrenheit: tool({
    description: "Convert a temperature in Celsius to Fahrenheit using the local MCP server.",
    inputSchema: z.object({ celsius: z.number().describe("Temperature in Celsius") }),
    execute: async ({ celsius }) => {
      const result = await mcpClient.callTool({
        name: "celsius_to_fahrenheit",
        arguments: { celsius },
      });
      return result.content[0]?.type === "text" ? result.content[0].text : "No text returned.";
    },
  }),
};

// ToolLoopAgent runs the model/tool loop instead of making one bare model call.
const agent = new ToolLoopAgent({
  model: bedrock(modelId),
  instructions: "You are a concise CAB432 teaching assistant. Use the Celsius conversion tool when needed.",
  tools,
  stopWhen: stepCountIs(3),
});

const readline = createInterface({ input: process.stdin, output: process.stdout });
const messages = [];

try {
  console.log("Ask a question, or type 'quit' to exit.");
  console.log("Try: Convert 20 degrees Celsius to Fahrenheit.");

  while (true) {
    const prompt = (await readline.question("You: ")).trim();
    if (["quit", "exit"].includes(prompt.toLowerCase())) break;
    if (!prompt) continue;

    // Preserve the conversation so later questions retain earlier context.
    messages.push({ role: "user", content: prompt });
    const result = await agent.generate({ messages });
    messages.push(...result.response.messages);
    console.log(`Assistant: ${result.text}`);
  }
} finally {
  readline.close();
  await mcpClient.close();
}
