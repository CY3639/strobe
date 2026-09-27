import { PutVectorsCommand } from "@aws-sdk/client-s3vectors";

import { s3Vectors } from "../src/shared/aws.mjs";
import { embedText } from "../src/shared/bedrock.mjs";
import { searchUserMedia } from "../src/shared/vectors.mjs";


const [, , modelId, bucket, index] = process.argv;

if (!modelId || !bucket || !index) {
    console.error("Usage: node scripts/isolation-test.mjs <embedding-model-id> <vector-bucket> <vector-index>");
    process.exit(1);
}

const query = "photos of my dog";
const TRAP_KEY = "isolation-trap";


// A vector identical to the query, owned by someone else.
await s3Vectors.send(new PutVectorsCommand({
    vectorBucketName: bucket,
    indexName: index,
    vectors: [{
        key: TRAP_KEY,
        data: { float32: await embedText({ modelId, text: query }) },
        metadata: {
            userId: "fake-other-user",
            caption: query,
            kind: "smoke-test"
        }
    }]
}));


const search = userId => searchUserMedia({
    embeddingModelId: modelId,
    vectorBucket: bucket,
    vectorIndex: index,
    userId,
    query,
    topK: 3
});

const asOwner = await search("fake-other-user");
const asOther = await search("vector-smoke-test-user");

const show = matches => matches.map(m => `${m.key} (${m.distance.toFixed(3)})`);
console.log("As fake-other-user:      ", show(asOwner));
console.log("As vector-smoke-test-user:", show(asOther));


// Control: the trap must exist for its owner, or the test proves nothing.
if (!asOwner.some(m => m.key === TRAP_KEY)) {
    throw new Error("CONTROL FAILED: trap not found even for its owner.");
}

if (asOther.some(m => m.key === TRAP_KEY)) {
    throw new Error("ISOLATION BROKEN: another user's vector was returned.");
}

console.log("\nPASS: the best possible match was invisible to a different user.");