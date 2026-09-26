import {
    GetParametersByPathCommand
} from "@aws-sdk/client-ssm";

import {
    ssm
} from "./aws.mjs";


const PARAMETER_ROOT = "/n5528712/a2";

let cachedConfig = null;


/**
 * Convert:
 *
 * /n5528712/a2/vector-bucket
 *
 * into:
 *
 * config["vector-bucket"]
 */
function shortParameterName(fullName) {

    return fullName
        .replace(`${PARAMETER_ROOT}/`, "")
        .trim();
}


export async function loadConfig() {

    if (cachedConfig) {
        return cachedConfig;
    }


    const values = {};

    let nextToken;


    do {

        const response = await ssm.send(
            new GetParametersByPathCommand({
                Path: PARAMETER_ROOT,
                Recursive: true,
                WithDecryption: true,
                NextToken: nextToken
            })
        );


        for (const parameter of response.Parameters ?? []) {

            if (!parameter.Name || parameter.Value === undefined) {
                continue;
            }


            values[
                shortParameterName(parameter.Name)
            ] = parameter.Value;
        }


        nextToken = response.NextToken;

    } while (nextToken);


    cachedConfig = {
        textModelId:
            values["text-model-id"],

        visionModelId:
            values["vision-model-id"],

        embeddingModelId:
            values["embedding-model-id"],

        classificationsTable:
            values["classifications-table"],

        agentRunsTable:
            values["agent-runs-table"],

        vectorBucket:
            values["vector-bucket"],

        vectorIndex:
            values["vector-index"],

        uploadsBucket:
            values["uploads-bucket"],

        postsTable:
            values["posts-table"],

        cognitoUserPoolId:
            values["cognito-user-pool-id"],

        cognitoClientId:
            values["cognito-client-id"],

        heartbeatUserId:
            values["heartbeat-user-id"],

        ownershipMode:
            values["ownership-mode"],

        uploadKeyRegex:
            values["upload-key-regex"]
    };


    return cachedConfig;
}