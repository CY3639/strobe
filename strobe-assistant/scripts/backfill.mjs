import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import {
    SQSClient,
    GetQueueUrlCommand,
    SendMessageCommand
} from "@aws-sdk/client-sqs";

import { dynamodb, s3, REGION } from "../src/shared/aws.mjs";
import { loadConfig } from "../src/shared/config.mjs";


const QUEUE_NAME = "n5528712-a2-classification";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const config = await loadConfig();
const userId = args.find(arg => !arg.startsWith("--")) ?? config.heartbeatUserId;

const sqs = new SQSClient({ region: REGION });


/*
 * posts.images holds bare keys today, but older posts may hold
 * full URLs. Normalise both to <userId>/<postId>/<fileId>.
 */
function toKey(reference) {
    if (typeof reference !== "string" || !reference) return null;

    let key = reference;
    if (/^https?:\/\//.test(key)) {
        key = decodeURIComponent(new URL(key).pathname);
    }
    key = key.replace(/^\/+/, "");

    const parts = key.split("/");
    return parts.length === 3 && parts.every(Boolean) ? key : null;
}


// A1 has no userId index on posts, so a filtered scan is the only
// option. Acceptable for a one-off migration; not for a live request.
async function postsFor(userId) {
    const posts = [];
    let lastKey;

    do {
        const page = await dynamodb.send(new ScanCommand({
            TableName: config.postsTable,
            FilterExpression: "userId = :userId",
            ExpressionAttributeValues: { ":userId": userId },
            ProjectionExpression: "id, userId, images",
            ExclusiveStartKey: lastKey
        }));
        posts.push(...(page.Items ?? []));
        lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    return posts;
}


// The file may never have been uploaded (the key is added to the
// post before the browser sends the file).
async function etagFor(key) {
    try {
        const head = await s3.send(new HeadObjectCommand({
            Bucket: config.uploadsBucket,
            Key: key
        }));
        return head.ETag.replaceAll('"', "");
    } catch (error) {
        if (error.name === "NotFound") return null;
        throw error;
    }
}


const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }));

const tally = { queued: 0, notAKey: 0, wrongOwner: 0, missingObject: 0 };
const posts = await postsFor(userId);

console.log(`User ${userId}: ${posts.length} post(s)${dryRun ? " [dry run]" : ""}\n`);

for (const post of posts) {
    for (const reference of post.images ?? []) {

        const key = toKey(reference);
        if (!key) {
            tally.notAKey++;
            console.log(`skip (not a key)   ${String(reference).slice(0, 80)}`);
            continue;
        }

        if (key.split("/")[0] !== userId) {
            tally.wrongOwner++;
            console.log(`skip (wrong owner) ${key}`);
            continue;
        }

        const etag = await etagFor(key);
        if (!etag) {
            tally.missingObject++;
            console.log(`skip (no file)     ${key}`);
            continue;
        }

        if (!dryRun) {
            await sqs.send(new SendMessageCommand({
                QueueUrl,
                MessageBody: JSON.stringify({
                    source: "strobe.backfill",
                    detail: {
                        bucket: { name: config.uploadsBucket },
                        object: { key, etag }
                    }
                })
            }));
        }

        tally.queued++;
        console.log(`queue              ${key}`);
    }
}

console.log("\n", tally);