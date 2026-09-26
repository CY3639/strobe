import {
    PutVectorsCommand
} from "@aws-sdk/client-s3vectors";

import {
    s3Vectors
} from "../src/aws.mjs";

import {
    embedText
} from "../src/bedrock.mjs";

import {
    searchUserMedia
} from "../src/vectors.mjs";


const [
    ,
    ,
    embeddingModelId,
    vectorBucket,
    vectorIndex
] = process.argv;


if (
    !embeddingModelId
    ||
    !vectorBucket
    ||
    !vectorIndex
) {

    console.error(
        "Usage:"
    );

    console.error(
        "node scripts/smoke-vectors.mjs <embedding-model-id> <vector-bucket> <vector-index>"
    );

    process.exit(1);
}


const testUserId =
    "vector-smoke-test-user";


const samples = [
    {
        key:
            "smoke-dog",

        text:
            "A black dog is running along a sandy beach."
    },

    {
        key:
            "smoke-cake",

        text:
            "A birthday cake with candles sits on a table."
    },

    {
        key:
            "smoke-car",

        text:
            "A red car is parked outside a suburban house."
    }
];


const vectors = [];


for (const sample of samples) {

    vectors.push({
        key:
            sample.key,

        data: {
            float32:
                await embedText({
                    modelId:
                        embeddingModelId,

                    text:
                        sample.text
                })
        },

        metadata: {
            userId:
                testUserId,

            caption:
                sample.text,

            kind:
                "smoke-test"
        }
    });
}


await s3Vectors.send(
    new PutVectorsCommand({
        vectorBucketName:
            vectorBucket,

        indexName:
            vectorIndex,

        vectors
    })
);


console.log(
    "Inserted 3 smoke-test vectors."
);


const matches =
    await searchUserMedia({
        embeddingModelId,
        vectorBucket,
        vectorIndex,

        userId:
            testUserId,

        query:
            "photos of my dog",

        topK:
            3
    });


console.dir(
    matches,
    {
        depth: null
    }
);


if (
    matches.length === 0
) {

    throw new Error(
        "No vector matches returned."
    );
}


console.log(
    "\nTop match:",
    matches[0]
);