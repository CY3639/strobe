import express from "express";
import crypto from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  StreamableHTTPServerTransport
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";

const PORT = 8000;

const app = express();

app.use(express.json());

const transports = new Map();

function createMcpServer() {
  const server = new McpServer({
    name: "n5528712-strobe-mcp",
    version: "1.0.0"
  });

  server.tool(
    "health_check",
    "Return a simple response proving that the Strobe MCP tool server is working.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: "Strobe MCP server is working."
        }
      ]
    })
  );

  server.tool(
    "echo",
    "Return the supplied text. Used only to verify the deployed MCP transport.",
    {
      text: z.string()
    },
    async ({ text }) => ({
      content: [
        {
          type: "text",
          text
        }
      ]
    })
  );

  return server;
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "n5528712-a2-mcp",
    version: "1.0.0"
  });
});

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];

    let transport;

    if (
      typeof sessionId === "string" &&
      transports.has(sessionId)
    ) {
      transport = transports.get(sessionId);
    } else if (
      !sessionId &&
      isInitializeRequest(req.body)
    ) {
      transport =
        new StreamableHTTPServerTransport({
          sessionIdGenerator: () =>
            crypto.randomUUID(),

          onsessioninitialized:
            newSessionId => {
              transports.set(
                newSessionId,
                transport
              );

              console.log(
                JSON.stringify({
                  event:
                    "MCP_SESSION_CREATED",
                  sessionId:
                    newSessionId
                })
              );
            }
        });

      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(
            transport.sessionId
          );
        }
      };

      const server =
        createMcpServer();

      await server.connect(
        transport
      );
    } else if (sessionId) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "MCP session not found"
        },
        id: null
      });

      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Bad MCP request"
        },
        id: null
      });

      return;
    }

    await transport.handleRequest(
      req,
      res,
      req.body
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event:
          "MCP_REQUEST_FAILED",

        message:
          error instanceof Error
            ? error.message
            : String(error)
      })
    );

    if (!res.headersSent) {
      res.status(500).json({
        message:
          "MCP request failed"
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId =
    req.headers["mcp-session-id"];

  if (
    typeof sessionId !== "string" ||
    !transports.has(sessionId)
  ) {
    res.status(400).send(
      "Missing or invalid MCP session"
    );

    return;
  }

  await transports
    .get(sessionId)
    .handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId =
    req.headers["mcp-session-id"];

  if (
    typeof sessionId !== "string" ||
    !transports.has(sessionId)
  ) {
    res.status(400).send(
      "Missing or invalid MCP session"
    );

    return;
  }

  await transports
    .get(sessionId)
    .handleRequest(req, res);
});

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      JSON.stringify({
        event:
          "MCP_SERVER_STARTED",
        service:
          "n5528712-a2-mcp",
        port:
          PORT
      })
    );
  }
);