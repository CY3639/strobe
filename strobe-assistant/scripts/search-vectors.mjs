import {
    searchUserMedia
} from "../src/shared/vectors.mjs";


const [
    ,
    ,
    embeddingModelId,
    vectorBucket,
    vectorIndex,
    userId,
    ...queryParts
] = process.argv;


const query =
    queryParts.join(" ").trim();


if (
    !embeddingModelId
    ||
    !vectorBucket
    ||
    !vectorIndex
    ||
    !userId
    ||
    !query
) {

    console.error(
        "Usage:"
    );

    console.error(
        "node scripts/search-vectors.mjs <model> <bucket> <index> <user-id> <query>"
    );

    process.exit(1);
}


const results =
    await searchUserMedia({
        embeddingModelId,
        vectorBucket,
        vectorIndex,
        userId,
        query,
        topK:
            5
    });


console.dir(
    results,
    {
        depth: null
    }
);