import {
    S3VectorsClient,
    PutVectorsCommand,
    QueryVectorsCommand
} from "@aws-sdk/client-s3vectors";


const REGION = "ap-southeast-2";

const VECTOR_BUCKET_NAME = "n5528712-a2-vectors";
const INDEX_NAME = "strobe-test-index";


const s3Vectors = new S3VectorsClient({
    region: REGION
});


const vectors = [
    {
        key: "dog-photo",
        data: {
            float32: [1.0, 0.0, 0.0]
        },
        metadata: {
            label: "dog",
            description: "A photo of a dog"
        }
    },

    {
        key: "puppy-photo",
        data: {
            float32: [0.9, 0.1, 0.0]
        },
        metadata: {
            label: "puppy",
            description: "A photo of a puppy"
        }
    },

    {
        key: "beach-photo",
        data: {
            float32: [0.0, 1.0, 0.0]
        },
        metadata: {
            label: "beach",
            description: "A photo of a beach"
        }
    },

    {
        key: "car-photo",
        data: {
            float32: [0.0, 0.0, 1.0]
        },
        metadata: {
            label: "car",
            description: "A photo of a car"
        }
    }
];


async function insertVectors() {

    console.log("Inserting test vectors...");

    const command = new PutVectorsCommand({
        vectorBucketName: VECTOR_BUCKET_NAME,
        indexName: INDEX_NAME,
        vectors
    });

    await s3Vectors.send(command);

    console.log("Vectors inserted successfully.");
}


async function queryVectors() {

    console.log("\nQuerying for something close to a dog...");

    const command = new QueryVectorsCommand({
        vectorBucketName: VECTOR_BUCKET_NAME,
        indexName: INDEX_NAME,

        queryVector: {
            float32: [0.05, 0.95, 0.0]
        },

        topK: 3,

        returnDistance: true,
        returnMetadata: true
    });

    const response = await s3Vectors.send(command);

    console.log("\nNearest neighbours:");

    for (const vector of response.vectors ?? []) {

        console.log({
            key: vector.key,
            distance: vector.distance,
            metadata: vector.metadata
        });
    }
}


async function main() {

    try {

        await insertVectors();

        await queryVectors();

    } catch (error) {

        console.error("\nS3 Vectors test failed.");

        console.error({
            name: error.name,
            message: error.message
        });

        process.exitCode = 1;
    }
}


await main();