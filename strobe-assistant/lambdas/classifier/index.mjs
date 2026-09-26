import {
    GetCommand,
    PutCommand
} from "@aws-sdk/lib-dynamodb";

import {
    dynamodb
} from "../../src/shared/aws.mjs";

import {
    loadConfig
} from "../../src/shared/config.mjs";

import {
    getS3ObjectBytes,
    imageFormatFromContentType
} from "../../src/shared/s3.mjs";

import {
    classifyImage
} from "../../src/shared/bedrock.mjs";

import {
    putCaptionVector
} from "../../src/shared/vectors.mjs";

import {
    resolveImageOwnership
} from "./ownership.mjs";


function parseSqsEventBridgeMessage(
    record
) {

    const event =
        JSON.parse(
            record.body
        );


    const bucket =
        event.detail
            ?.bucket
            ?.name;


    const rawKey =
        event.detail
            ?.object
            ?.key;


    const etag =
        event.detail
            ?.object
            ?.etag
        ??
        null;


    if (
        !bucket
        ||
        !rawKey
    ) {

        throw new Error(
            `Unexpected S3 EventBridge message: ${record.body}`
        );
    }


    const key =
        decodeURIComponent(
            rawKey.replace(/\+/g, " ")
        );


    return {
        bucket,
        key,
        etag
    };
}


async function alreadyProcessed({
    tableName,
    imageKey,
    sourceETag
}) {

    const result =
        await dynamodb.send(
            new GetCommand({
                TableName:
                    tableName,

                Key: {
                    imageKey
                }
            })
        );


    return (
        result.Item
        &&
        result.Item.status === "COMPLETED"
        &&
        result.Item.sourceETag === sourceETag
    );
}


async function processRecord({
    record,
    config
}) {

    const {
        bucket,
        key,
        etag
    } =
        parseSqsEventBridgeMessage(
            record
        );


    console.log(
        JSON.stringify({
            event:
                "CLASSIFICATION_STARTED",

            bucket,
            key,
            etag
        })
    );


    /*
     * At-least-once delivery means this message may arrive again.
     *
     * Avoid paying Bedrock again if this exact S3 version was
     * already successfully processed.
     */
    if (
        await alreadyProcessed({
            tableName:
                config.classificationsTable,

            imageKey:
                key,

            sourceETag:
                etag
        })
    ) {

        console.log(
            JSON.stringify({
                event:
                    "CLASSIFICATION_ALREADY_COMPLETED",

                key,
                etag
            })
        );


        return;
    }


    const {
        userId,
        postId
    } =
        await resolveImageOwnership({
            imageKey:
                key,

            config
        });


    const {
        bytes,
        contentType
    } =
        await getS3ObjectBytes({
            bucket,
            key
        });


    const imageFormat =
        imageFormatFromContentType(
            contentType
        );


    const classification =
        await classifyImage({
            modelId:
                config.visionModelId,

            imageBytes:
                bytes,

            imageFormat
        });


    const classifiedAt =
        new Date()
            .toISOString();


    /*
     * Derived AI state.
     *
     * A failed AI call never invalidates the original A1 Post.
     */
    await dynamodb.send(
        new PutCommand({
            TableName:
                config.classificationsTable,

            Item: {
                imageKey:
                    key,

                userId,
                postId,

                caption:
                    classification.caption,

                labels:
                    classification.labels,

                classifiedAt,

                sourceETag:
                    etag,

                sourceBucket:
                    bucket,

                modelId:
                    config.visionModelId,

                status:
                    "COMPLETED"
            }
        })
    );


    const vectorKey =
        await putCaptionVector({
            embeddingModelId:
                config.embeddingModelId,

            vectorBucket:
                config.vectorBucket,

            vectorIndex:
                config.vectorIndex,

            userId,
            postId,

            imageKey:
                key,

            caption:
                classification.caption,

            classifiedAt
        });


    console.log(
        JSON.stringify({
            event:
                "CLASSIFICATION_COMPLETED",

            userId,
            postId,

            imageKey:
                key,

            vectorKey,

            classifiedAt
        })
    );
}


export const handler =
async event => {

    const config =
        await loadConfig();


    /*
     * Lambda partial-batch response format.
     *
     * One broken image should not force successfully processed
     * messages in the batch to be retried.
     */
    const batchItemFailures =
        [];


    for (
        const record
        of
        event.Records ?? []
    ) {

        try {

            await processRecord({
                record,
                config
            });

        } catch (error) {

            console.error(
                JSON.stringify({
                    event:
                        "CLASSIFICATION_FAILED",

                    messageId:
                        record.messageId,

                    error:
                        error instanceof Error
                            ? error.message
                            : String(error)
                })
            );


            batchItemFailures.push({
                itemIdentifier:
                    record.messageId
            });
        }
    }


    return {
        batchItemFailures
    };
};