import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

import { dynamodb } from "../src/shared/aws.mjs";
import { loadConfig } from "../src/shared/config.mjs";
import { embedText } from "../src/shared/bedrock.mjs";


const [, , userId, ...words] = process.argv;
const query = words.join(" ");

if (!userId || !query) {
    console.error('Usage: node scripts/explain-ranking.mjs <user-id> "<query>"');
    process.exit(1);
}

const config = await loadConfig();
const embed = text => embedText({ modelId: config.embeddingModelId, text });

// The same measure the index uses.
function cosineDistance(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return 1 - dot / Math.sqrt(normA * normB);
}

const { Items: rows = [] } = await dynamodb.send(new QueryCommand({
    TableName: config.classificationsTable,
    IndexName: "userId-classifiedAt-index",
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId }
}));

const queryVector = await embed(query);
const results = [];

for (const row of rows.filter(r => r.status === "COMPLETE")) {
    const { Item: post } = await dynamodb.send(new GetCommand({
        TableName: config.postsTable,
        Key: { id: row.postId }
    }));

    const title = post?.title ?? "";
    const description = post?.description ?? "";
    const combined = [row.caption, title, description]
        .map(s => (s ?? "").trim()).filter(Boolean).join(". ");

    
    // Remove Gemma's template opener: "The photo shows a close-up of ..."
    const stripped = row.caption
        .replace(/^(the|this)\s+(photo|image|picture)\s+(shows|depicts|features)\s+/i, "")
        .replace(/^a close-up of\s+/i, "");

    const withLabels = `${stripped}. ${(row.labels ?? []).join(", ")}`;

    results.push({
        caption: row.caption.slice(0, 40),
        labels: (row.labels ?? []).join(", ").slice(0, 35),
        captionOnly: +cosineDistance(queryVector, await embed(row.caption)).toFixed(3),
        combined: +cosineDistance(queryVector, await embed(combined)).toFixed(3),
        stripped: +cosineDistance(queryVector, await embed(stripped)).toFixed(3),
        withLabels: +cosineDistance(queryVector, await embed(withLabels)).toFixed(3)
    });

    // results.push({
    //     caption: row.caption.slice(0, 45),
    //     title: title.slice(0, 25),
    //     descChars: description.length,
    //     captionOnly: +cosineDistance(queryVector, await embed(row.caption)).toFixed(3),
    //     combined: +cosineDistance(queryVector, await embed(combined)).toFixed(3)
    // });
}

console.log(`\nQuery: "${query}"   (lower distance = closer)`);
console.table(results.sort((a, b) => a.captionOnly - b.captionOnly));