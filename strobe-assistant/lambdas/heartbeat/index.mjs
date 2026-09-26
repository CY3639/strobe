import crypto from "node:crypto";

import {
    QueryCommand,
    PutCommand
} from "@aws-sdk/lib-dynamodb";

import {
    dynamodb
} from "../../src/shared/aws.mjs";

import {
    loadConfig
} from "../../src/shared/config.mjs";

import {
    generateText
} from "../../src/shared/bedrock.mjs";


export const handler =
async () => {

    const config =
        await loadConfig();


    const runId =
        crypto.randomUUID();


    const startedAt =
        new Date()
            .toISOString();


    try {

        /*
         * Retrieve the latest classifications for the configured
         * demonstration user.
         *
         * This requires:
         *
         * userId-classifiedAt-index
         *
         * PK: userId
         * SK: classifiedAt
         */
        const recent =
            await dynamodb.send(
                new QueryCommand({
                    TableName:
                        config.classificationsTable,

                    IndexName:
                        "userId-classifiedAt-index",

                    KeyConditionExpression:
                        "userId = :userId",

                    ExpressionAttributeValues: {
                        ":userId":
                            config.heartbeatUserId
                    },

                    ScanIndexForward:
                        false,

                    Limit:
                        10
                })
            );


        const context =
            (recent.Items ?? [])
                .map(
                    item =>
                        `- ${item.classifiedAt}: ${item.caption}`
                )
                .join("\n");


        const prompt = `
You are running a scheduled Strobe Assistant retrospective.

Using only the photo descriptions below, write a concise factual
summary of the user's recent Strobe content.

If there are no descriptions, state that there was no recent
classified content.

Do not invent people, places, events, dates or relationships.

Photo descriptions:

${context || "(none)"}
`.trim();


        const summary =
            await generateText({
                modelId:
                    config.textModelId,

                prompt,

                maxTokens:
                    180,

                temperature:
                    0.2
            });


        const completedAt =
            new Date()
                .toISOString();


        await dynamodb.send(
            new PutCommand({
                TableName:
                    config.agentRunsTable,

                Item: {
                    runId,

                    userId:
                        config.heartbeatUserId,

                    runType:
                        "scheduled-retrospective",

                    startedAt,

                    completedAt,

                    status:
                        "COMPLETED",

                    summary,

                    modelId:
                        config.textModelId
                }
            })
        );


        console.log(
            JSON.stringify({
                event:
                    "HEARTBEAT_COMPLETED",

                runId,

                userId:
                    config.heartbeatUserId,

                startedAt,

                completedAt
            })
        );


        return {
            runId,
            status:
                "COMPLETED",
            summary
        };

    } catch (error) {

        const completedAt =
            new Date()
                .toISOString();


        await dynamodb.send(
            new PutCommand({
                TableName:
                    config.agentRunsTable,

                Item: {
                    runId,

                    userId:
                        config.heartbeatUserId,

                    runType:
                        "scheduled-retrospective",

                    startedAt,

                    completedAt,

                    status:
                        "FAILED",

                    modelId:
                        config.textModelId,

                    error:
                        error instanceof Error
                            ? error.message
                            : String(error)
                }
            })
        );


        console.error(
            error
        );


        throw error;
    }
};