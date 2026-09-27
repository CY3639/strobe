import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

import { dynamodb } from "../src/shared/aws.mjs";
import { loadConfig } from "../src/shared/config.mjs";
import { putImageVector } from "../src/shared/vectors.mjs";

const config = await loadConfig();
const userId = process.argv[2] ?? config.heartbeatUserId;

const { Items: rows = [] } = await dynamodb.send(new QueryCommand({
    TableName: config.classificationsTable,
    IndexName: "userId-classifiedAt-index",
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId }
}));

for (const row of rows.filter(r => r.status === "COMPLETE")) {
    const { Item: post } = await dynamodb.send(new GetCommand({
        TableName: config.postsTable,
        Key: { id: row.postId }
    }));

    await putImageVector({
        embeddingModelId: config.embeddingModelId,
        vectorBucket: config.vectorBucket,
        vectorIndex: config.vectorIndex,
        userId,
        postId: row.postId,
        imageKey: row.imageKey,
        caption: row.caption,
        labels: row.labels ?? [],
        title: post?.title,
        description: post?.description,
        classifiedAt: row.classifiedAt
    });

    console.log(`reindexed ${row.imageKey}`);
}