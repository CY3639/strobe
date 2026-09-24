import "dotenv/config";

import {
    McpServer
} from "@modelcontextprotocol/sdk/server/mcp.js";

import {
    StdioServerTransport
} from "@modelcontextprotocol/sdk/server/stdio.js";

import {
    z
} from "zod";

import {
    StrobeApiError,
    StrobeClient
} from "./strobe-client.mjs";


// ---------------------------------------------------------------------
// MCP SERVER
// ---------------------------------------------------------------------

const server =
    new McpServer({
        name: "strobe-mcp-server",
        version: "1.0.0"
    });


// ---------------------------------------------------------------------
// STROBE CLIENT FACTORY
// ---------------------------------------------------------------------

function createStrobeClient() {

    const baseUrl =
        process.env.STROBE_BASE_URL?.trim();

    const bearerToken =
        process.env.STROBE_BEARER_TOKEN?.trim();


    const missing = [];


    if (!baseUrl) {
        missing.push(
            "STROBE_BASE_URL"
        );
    }


    if (!bearerToken) {
        missing.push(
            "STROBE_BEARER_TOKEN"
        );
    }


    if (missing.length > 0) {

        throw new Error(
            `Missing Strobe configuration: ${
                missing.join(", ")
            }`
        );
    }


    return new StrobeClient({
        baseUrl,
        bearerToken
    });
}


// ---------------------------------------------------------------------
// MCP TOOL
// ---------------------------------------------------------------------

server.registerTool(

    "get_strobe_post",

    {
        title:
            "Get Strobe Post",

        description:
            "Retrieve one real post from the authenticated " +
            "Strobe backend when the post ID is already known.",

        inputSchema: {
            post_id:
                z
                    .string()
                    .min(1)
                    .max(128)
                    .describe(
                        "The Strobe post identifier."
                    )
        }
    },

    async ({
        post_id
    }) => {

        try {

            const client =
                createStrobeClient();


            const result =
                await client.getPost(
                    post_id
                );


            return {
                content: [
                    {
                        type: "text",

                        text:
                            JSON.stringify(
                                result,
                                null,
                                2
                            )
                    }
                ]
            };

        } catch (error) {

            const message =
                error instanceof StrobeApiError ||
                error instanceof Error
                    ? error.message
                    : "Unknown Strobe MCP error";


            return {
                isError: true,

                content: [
                    {
                        type: "text",
                        text: message
                    }
                ]
            };
        }
    }
);


// ---------------------------------------------------------------------
// STDIO TRANSPORT
// ---------------------------------------------------------------------

async function main() {

    const transport =
        new StdioServerTransport();


    await server.connect(
        transport
    );


    // Do not console.log() here.
    //
    // stdout is reserved for MCP protocol traffic.
    console.error(
        "Strobe MCP server connected over stdio."
    );
}


main().catch(
    error => {

        console.error(
            "Fatal MCP server error:",
            error
        );

        process.exit(1);
    }
);