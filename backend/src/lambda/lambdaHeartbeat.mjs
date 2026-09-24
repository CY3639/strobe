import crypto from "node:crypto";

import {
    DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
    DynamoDBDocumentClient,
    PutCommand,
    UpdateCommand
} from "@aws-sdk/lib-dynamodb";


const REGION =
    process.env.AWS_REGION ||
    "ap-southeast-2";

const AGENT_RUNS_TABLE =
    process.env.AGENT_RUNS_TABLE;


const dynamodb =
    DynamoDBDocumentClient.from(
        new DynamoDBClient({
            region: REGION
        })
    );


export const handler = async (event) => {

    console.log(
        "Heartbeat invoked:",
        JSON.stringify(event, null, 2)
    );


    if (!AGENT_RUNS_TABLE) {
        throw new Error(
            "AGENT_RUNS_TABLE environment variable is required"
        );
    }


    /*
     * For the initial heartbeat implementation this can come from
     * configuration.
     *
     * Later, if the heartbeat processes multiple Strobe users,
     * the worker should enumerate those users and create a run
     * associated with each user's Cognito sub.
     */
    const userId =
        process.env.HEARTBEAT_USER_ID ||
        "SYSTEM";


    const runId =
        crypto.randomUUID();

    const startedAt =
        new Date().toISOString();


    /*
     * ---------------------------------------------------------
     * STEP 1
     * Persist the fact that the autonomous run has started.
     * ---------------------------------------------------------
     */

    await dynamodb.send(
        new PutCommand({
            TableName: AGENT_RUNS_TABLE,

            Item: {
                runId,
                userId,

                runType: "HEARTBEAT",

                trigger: "EVENTBRIDGE_SCHEDULE",

                status: "STARTED",

                actions: [],

                startedAt,
                createdAt: startedAt
            },

            ConditionExpression:
                "attribute_not_exists(runId)"
        })
    );


    try {

        /*
         * -----------------------------------------------------
         * STEP 2
         * Autonomous heartbeat work.
         * -----------------------------------------------------
         *
         * Later this becomes something like:
         *
         * 1. inspect recent Strobe content
         * 2. inspect classifications
         * 3. perform semantic retrieval
         * 4. call Bedrock
         * 5. generate a retrospective / useful summary
         *
         * For now we keep this deterministic while validating
         * the AgentRun persistence path.
         */

        const actions = [
            "heartbeat invoked by EventBridge",
            "created AgentRun record"
        ];


        const summary =
            "Scheduled heartbeat completed successfully.";


        const completedAt =
            new Date().toISOString();


        /*
         * -----------------------------------------------------
         * STEP 3
         * Mark the existing run as successful.
         * -----------------------------------------------------
         */

        await dynamodb.send(
            new UpdateCommand({
                TableName:
                    AGENT_RUNS_TABLE,

                Key: {
                    runId
                },

                UpdateExpression: `
                    SET
                        #status = :status,
                        summary = :summary,
                        actions = :actions,
                        completedAt = :completedAt
                `,

                ExpressionAttributeNames: {
                    "#status": "status"
                },

                ExpressionAttributeValues: {
                    ":status": "COMPLETE",
                    ":summary": summary,
                    ":actions": actions,
                    ":completedAt": completedAt
                },

                ConditionExpression:
                    "attribute_exists(runId)"
            })
        );


        console.log(
            "Heartbeat completed:",
            {
                runId,
                userId,
                summary
            }
        );


        return {
            statusCode: 200,

            runId,

            status: "COMPLETE",

            summary
        };


    } catch (error) {

        console.error(
            "Heartbeat execution failed:",
            error
        );


        const completedAt =
            new Date().toISOString();


        /*
         * -----------------------------------------------------
         * STEP 4
         * Preserve failure state.
         * -----------------------------------------------------
         */

        try {

            await dynamodb.send(
                new UpdateCommand({
                    TableName:
                        AGENT_RUNS_TABLE,

                    Key: {
                        runId
                    },

                    UpdateExpression: `
                        SET
                            #status = :status,
                            errorMessage = :errorMessage,
                            completedAt = :completedAt
                    `,

                    ExpressionAttributeNames: {
                        "#status": "status"
                    },

                    ExpressionAttributeValues: {
                        ":status": "FAILED",

                        ":errorMessage":
                            error?.message ||
                            String(error),

                        ":completedAt":
                            completedAt
                    },

                    ConditionExpression:
                        "attribute_exists(runId)"
                })
            );

        } catch (persistenceError) {

            console.error(
                "Failed to update AgentRun failure state:",
                persistenceError
            );
        }


        throw error;
    }
};