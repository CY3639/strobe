/** Serve the AI SDK/MCP teaching agent to an ACP web client over WebSocket. */

import * as acp from "@agentclientprotocol/sdk";
import { createNodeWebSocketUpgradeHandler } from "@agentclientprotocol/sdk/experimental/node";
import { AcpServer } from "@agentclientprotocol/sdk/experimental/server";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { Client as McpClient } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { z } from "zod";

const host = "127.0.0.1";
const port = 7331;
const region = process.env.AWS_REGION ?? "ap-southeast-2";
const modelId = "nvidia.nemotron-super-3-120b";
// The MCP practical is extracted beside this directory.
const mcpServerPath = fileURLToPath(new URL("../mcp_servers_js/mcp_server.mjs", import.meta.url));

const bedrock = createAmazonBedrock({
  region,
  credentialProvider: fromNodeProviderChain(),
});
const mcpClient = new McpClient({ name: "cab432-acp-agent", version: "1.0.0" });
await mcpClient.connect(new StdioClientTransport({
  command: process.execPath,
  args: [mcpServerPath],
}));

// Wrap the MCP tool in the AI SDK shape that ToolLoopAgent expects.
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
const agent = new ToolLoopAgent({
  model: bedrock(modelId),
  instructions: "You are a concise CAB432 teaching assistant. Use the Celsius conversion tool when needed.",
  tools,
  stopWhen: stepCountIs(3),
});

// #region acp-session-handlers
const sessions = new Map();
const acpAgent = acp
  .agent({ name: "cab432-bedrock-agent" })
  .onRequest(acp.methods.agent.initialize, () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: { loadSession: false },
  }))
  .onRequest(acp.methods.agent.session.new, () => {
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, []);
    return { sessionId };
  })
  .onRequest(acp.methods.agent.session.prompt, async (context) => {
    const { sessionId, prompt } = context.params;
    const messages = sessions.get(sessionId);
    if (!messages) throw new Error(`Unknown session: ${sessionId}`);
    const text = prompt.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
    if (!text) return { stopReason: "end_turn" };

    // Keep conversation history for this browser tab, just as the stdio chat did.
    messages.push({ role: "user", content: text });
    const result = await agent.generate({ messages });
    messages.push(...result.response.messages);

    // ACP sends the response to the browser as a streamed session update.
    await context.client.notify(acp.methods.client.session.update, {
      sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: result.text } },
    });
    return { stopReason: "end_turn" };
  });
// #endregion acp-session-handlers

// #region websocket-server
const acpServer = new AcpServer({ agent: acpAgent });
const webSocketServer = new WebSocketServer({ noServer: true });
const upgrade = createNodeWebSocketUpgradeHandler(acpServer, webSocketServer);
const server = createServer((request, response) => {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Use the WebSocket endpoint at /acp.\n");
});

server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url ?? "/", `http://${request.headers.host}`).pathname !== "/acp") {
    socket.destroy();
    return;
  }
  upgrade(request, socket, head);
});
server.listen(port, host, () => console.log(`ACP server listening at ws://${host}:${port}/acp`));
// #endregion websocket-server

async function shutdown() {
  await mcpClient.close();
  server.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
