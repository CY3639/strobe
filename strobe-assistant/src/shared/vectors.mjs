import {
    PutVectorsCommand,
    QueryVectorsCommand
} from "@aws-sdk/client-s3vectors";

import {
    s3Vectors
} from "./aws.mjs";

import {
    embedText
} from "./bedrock.mjs";


export async function putCaptionVector({
    embeddingModelId,
    vectorBucket,
    vectorIndex,
    userId,
    postId,
    imageKey,
    caption,
    classifiedAt
}) {

    const embedding =
        await embedText({
            modelId:
                embeddingModelId,

            text:
                caption
        });


    /*
     * Stable key:
     *
     * Reprocessing the same image overwrites the same logical
     * vector instead of producing a duplicate.
     */
    const vectorKey =
        `${imageKey}#caption`;


    await s3Vectors.send(
        new PutVectorsCommand({
            vectorBucketName:
                vectorBucket,

            indexName:
                vectorIndex,

            vectors: [
                {
                    key:
                        vectorKey,

                    data: {
                        float32:
                            embedding
                    },

                    metadata: {
                        userId,
                        postId,
                        imageKey,
                        caption,

                        kind:
                            "image-caption",

                        classifiedAt
                    }
                }
            ]
        })
    );


    return vectorKey;
}


export async function searchUserMedia({
    embeddingModelId,
    vectorBucket,
    vectorIndex,
    userId,
    query,
    topK = 5
}) {

    const queryEmbedding =
        await embedText({
            modelId:
                embeddingModelId,

            text:
                query
        });


    const response =
        await s3Vectors.send(
            new QueryVectorsCommand({
                vectorBucketName:
                    vectorBucket,

                indexName:
                    vectorIndex,

                queryVector: {
                    float32:
                        queryEmbedding
                },

                topK:
                    Math.min(
                        Math.max(topK, 1),
                        10
                    ),

                /*
                 * SECURITY BOUNDARY:
                 *
                 * Search only within this authenticated user's data.
                 *
                 * Do not retrieve everybody's nearest neighbours and
                 * filter them in JavaScript afterward.
                 */
                filter: {
                    userId
                },

                returnDistance:
                    true,

                returnMetadata:
                    true
            })
        );


    return (
        response.vectors
        ??
        []
    ).map(
        vector => ({
            key:
                vector.key,

            distance:
                vector.distance,

            metadata:
                vector.metadata
                ??
                {}
        })
    );
}