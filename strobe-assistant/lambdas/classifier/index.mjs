import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { dynamodb } from "../../src/shared/aws.mjs";
import { loadConfig } from "../../src/shared/config.mjs";
import { getS3ObjectBytes, detectImageFormat } from "../../src/shared/s3.mjs";
import { classifyImage } from "../../src/shared/bedrock.mjs";
import { putImageVector } from "../../src/shared/vectors.mjs";
import { PermanentError } from "../../src/shared/errors.mjs";


// Bedrock's per-image limit (believed ~3.75 MB). Verify with a large photo.
const MAX_IMAGE_BYTES = 3_750_000;

const log = (event, fields = {}) =>
    console.log(JSON.stringify({ event, ...fields }));

const stripQuotes = value => value?.replaceAll('"', "") ?? null;


/*
 * The SQS body is the EventBridge "Object Created" event.
 * The backfill script (Phase 4) sends the same shape.
 */
function parseMessage(record) {
    const body = JSON.parse(record.body);
    const bucket = body.detail?.bucket?.name;
    const key = body.detail?.object?.key;

    if (!bucket || !key) {
        throw new PermanentError(`Unexpected message shape: ${record.body.slice(0, 200)}`);
    }

    return { bucket, key, etag: stripQuotes(body.detail?.object?.etag) };
}


/*
 * lambdaUpload mints every key, after checking ownership:
 *   posts:   <userId>/<postId>/<fileId>
 *   moments: <userId>/moments/<fileId>
 * So the key itself tells us the owner. No lookup needed.
 */
function parseKey(key) {
    const parts = key.split("/");

    if (parts.length !== 3 || parts.some(part => !part)) {
        return { kind: "unrecognised" };
    }

    const [userId, second] = parts;
    return second === "moments"
        ? { kind: "moment" }
        : { kind: "post", userId, postId: second };
}


async function alreadyComplete({ table, imageKey, etag }) {
    if (!etag) return false;

    const { Item } = await dynamodb.send(new GetCommand({
        TableName: table,
        Key: { imageKey }
    }));

    return Item?.status === "COMPLETE" && Item.sourceETag === etag;
}


async function processRecord(record, config) {
    const { bucket, key, etag: eventEtag } = parseMessage(record);
    const owner = parseKey(key);

    if (owner.kind !== "post") {
        log("CLASSIFICATION_SKIPPED", { key, reason: owner.kind });
        return;
    }

    const { userId, postId } = owner;
    log("CLASSIFICATION_STARTED", { key, userId, postId });

    // At-least-once delivery: don't pay Bedrock twice for the same file version.
    if (await alreadyComplete({ table: config.classificationsTable, imageKey: key, etag: eventEtag })) {
        log("CLASSIFICATION_ALREADY_COMPLETED", { key, etag: eventEtag });
        return;
    }

    // Read (never write) the A1 post: it must exist and match the key's owner.
    const { Item: post } = await dynamodb.send(new GetCommand({
        TableName: config.postsTable,
        Key: { id: postId }
    }));

    if (!post) {
        log("CLASSIFICATION_SKIPPED", { key, reason: "post-not-found" });
        return;
    }
    if (post.userId !== userId) {
        log("CLASSIFICATION_SKIPPED", { key, reason: "owner-mismatch" });
        return;
    }

    const { bytes, etag: s3Etag } = await getS3ObjectBytes({ bucket, key });

    if (bytes.length > MAX_IMAGE_BYTES) {
        throw new PermanentError(`Image is ${bytes.length} bytes; the vision model limit is ${MAX_IMAGE_BYTES}.`);
    }

    const imageFormat = detectImageFormat(bytes);
    const sourceETag = eventEtag ?? stripQuotes(s3Etag);

    const { caption, labels } = await classifyImage({
        modelId: config.visionModelId,
        imageBytes: bytes,
        imageFormat
    });

    const classifiedAt = new Date().toISOString();

    // 1. Vector FIRST.
    const vectorKey = await putImageVector({
        embeddingModelId: config.embeddingModelId,
        vectorBucket: config.vectorBucket,
        vectorIndex: config.vectorIndex,
        userId,
        postId,
        imageKey: key,
        caption,
        labels,
        title: post.title,
        description: post.description,
        classifiedAt
    });

    // 2. Row LAST: "COMPLETE" is the commit marker for the whole job.
    await dynamodb.send(new PutCommand({
        TableName: config.classificationsTable,
        Item: {
            imageKey: key,
            userId,
            postId,
            caption,
            labels,
            classifiedAt,
            sourceETag,
            sourceBucket: bucket,
            imageFormat,
            modelId: config.visionModelId,
            embeddingModelId: config.embeddingModelId,
            vectorKey,
            status: "COMPLETE"
        }
    }));

    log("CLASSIFICATION_COMPLETED", { key, userId, postId, vectorKey, labels });
}


async function recordPermanentFailure(record, config, error) {
    let key = "unknown";
    try { key = parseMessage(record).key; } catch { /* unparseable */ }

    const owner = parseKey(key);
    if (owner.kind !== "post") return;

    await dynamodb.send(new PutCommand({
        TableName: config.classificationsTable,
        Item: {
            imageKey: key,
            userId: owner.userId,
            postId: owner.postId,
            status: "FAILED",
            error: error.message,
            classifiedAt: new Date().toISOString()
        }
    }));
}


export const handler = async (event) => {
    const config = await loadConfig();
    const batchItemFailures = [];

    for (const record of event.Records ?? []) {
        try {
            await processRecord(record, config);

        } catch (error) {

            if (error instanceof PermanentError) {
                // Retrying can't fix this: record it and let SQS delete the message.
                log("CLASSIFICATION_FAILED_PERMANENTLY", { messageId: record.messageId, error: error.message });
                await recordPermanentFailure(record, config, error).catch(e => console.error(e));
                continue;
            }

            // Possibly temporary (throttling, network): hand back to SQS to retry.
            log("CLASSIFICATION_FAILED", {
                messageId: record.messageId,
                attempt: record.attributes?.ApproximateReceiveCount,
                error: error.message,
                errorName: error.name,
                httpStatus: error.$metadata?.httpStatusCode
            });
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }

    return { batchItemFailures };
};