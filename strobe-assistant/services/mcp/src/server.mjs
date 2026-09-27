import { createServer } from "node:http";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import {
    toNodeHandler,
    localhostHostValidation,
    localhostOriginValidation
} from "@modelcontextprotocol/node";
import * as z from "zod/v4";

import {
    ToolError,
    searchUserMediaTool,
    getPostTool,
    getImageUrlTool
} from "./tool-core.mjs";


const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8000);
const DEV_USER_ID = process.env.DEV_STROBE_USER_ID;

const log = (event, fields = {}) =>
    console.log(JSON.stringify({ event, ...fields }));


/*
 * WHO IS CALLING? Phase 5: a fixed development user.
 * Phase 8 replaces this one function with Cognito JWT verification.
 * Returns null when the caller cannot be identified.
 */
function resolveAuth(req) {
    if (!DEV_USER_ID) return null;

    return {
        token: "dev",
        clientId: "dev",
        scopes: [],
        extra: { userId: DEV_USER_ID }
    };
}


// Every tool runs through here: identity check, logging, safe errors.
async function runTool(name, authInfo, work) {
    const userId = authInfo?.extra?.userId;

    if (!userId) {
        log("MCP_TOOL_REJECTED", { tool: name, reason: "unauthenticated" });
        return { content: [{ type: "text", text: "Unauthenticated." }], isError: true };
    }

    const started = Date.now();

    try {
        const result = await work(userId);
        log("MCP_TOOL_CALLED", { tool: name, userId, ms: Date.now() - started });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };

    } catch (error) {
        log("MCP_TOOL_FAILED", { tool: name, userId, error: error.message });
        const safe = error instanceof ToolError ? error.message : "The tool failed. Try again.";
        return { content: [{ type: "text", text: safe }], isError: true };
    }
}


/*
 * Built fresh for EVERY request, around that request's caller.
 * No tool accepts a userId: identity comes only from authInfo.
 */
function buildServer({ authInfo }) {
    const server = new McpServer({ name: "strobe-mcp", version: "1.0.0" });

    server.registerTool(
        "search_user_media",
        {
            description:
                "Search the signed-in user's own Strobe photos by meaning. " +
                "Write the query as a short description of what the photo would show, " +
                "for example 'Fireworks exploding in the night sky over a city' or " +
                "'A cat's face up close'. Do not start with 'a photo of' and do not " +
                "send single keywords. Results marked weakMatch may not be relevant: " +
                "say so rather than presenting them as matches.",
            inputSchema: z.object({
                query: z.string().min(3).max(300)
                    .describe("A short scene description of the photos wanted."),
                topK: z.number().int().min(1).max(10).optional()
                    .describe("How many results to return (default 5).")
            })
        },
        async ({ query, topK }) => runTool("search_user_media", authInfo, userId =>
            searchUserMediaTool({ authenticatedUserId: userId, query, topK }))
    );

    server.registerTool(
        "get_post",
        {
            description:
                "Get one of the user's own Strobe posts (title, description, image keys, " +
                "date) by a postId taken from search results.",
            inputSchema: z.object({
                postId: z.string().min(1).max(100)
            })
        },
        async ({ postId }) => runTool("get_post", authInfo, userId =>
            getPostTool({ authenticatedUserId: userId, postId }))
    );

    server.registerTool(
        "get_image_url",
        {
            description:
                "Get a temporary (5-minute) link to one of the user's own images by an " +
                "imageKey taken from search results. Use only when an image must be shown.",
            inputSchema: z.object({
                imageKey: z.string().min(1).max(300)
            })
        },
        async ({ imageKey }) => runTool("get_image_url", authInfo, userId =>
            getImageUrlTool({ authenticatedUserId: userId, imageKey }))
    );

    return server;
}


const handler = createMcpHandler(buildServer, { responseMode: "json" });
const nodeHandler = toNodeHandler(handler);

// Localhost guards stop DNS rebinding. In ECS (HOST=0.0.0.0) the load
// balancer and Phase 8's token check take over this job.
const localOnly = HOST === "127.0.0.1";
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();


const httpServer = createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;

    if (req.method === "GET" && path === "/healthz") {
        res.writeHead(200, { "content-type": "text/plain" }).end("ok");
        return;
    }

    if (path !== "/mcp") {
        res.writeHead(404).end();
        return;
    }

    if (localOnly && (!validateHost(req, res) || !validateOrigin(req, res))) {
        return;
    }

    const authInfo = resolveAuth(req);
    if (!authInfo) {
        log("MCP_REQUEST_REJECTED", { reason: "unauthenticated" });
        res.writeHead(401, {
            "content-type": "application/json",
            "www-authenticate": "Bearer"
        }).end(JSON.stringify({ error: "unauthenticated" }));
        return;
    }

    req.auth = authInfo;          // toNodeHandler forwards this as authInfo
    void nodeHandler(req, res);
});


httpServer.listen(PORT, HOST, () => {
    log("MCP_SERVER_STARTED", { host: HOST, port: PORT, devUser: Boolean(DEV_USER_ID) });
});

// ECS stops tasks with SIGTERM; finish in-flight calls first.
for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, async () => {
        log("MCP_SERVER_STOPPING", { signal });
        await handler.close();
        httpServer.close(() => process.exit(0));
    });
}