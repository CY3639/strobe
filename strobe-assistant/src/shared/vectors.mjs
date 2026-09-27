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

/*
 * Remove Gemma's template opener so the vector represents the
 * subject, not the word "photo". Measured: the opener made
 * one caption the top match for unrelated queries.
 */
export function normaliseCaption(caption = "") {
    return caption
        .trim()
        .replace(/^(the|this)\s+(photo|image|picture)\s+(shows|depicts|features)\s+/i, "")
        .replace(/^a close-up of\s+/i, "")
        .replace(/^./, first => first.toUpperCase());
}

export async function putImageVector({
    embeddingModelId,
    vectorBucket,
    vectorIndex,
    userId,
    postId,
    imageKey,
    caption,
    labels = [],
    title,
    description,
    classifiedAt
}) {
    // Model-written text only. Measured: user titles confused Titan
    // (e.g. "meow" moved a kitten photo AWAY from "cats").
    const text = [normaliseCaption(caption), labels.join(", ")]
        .map(part => (part ?? "").trim())
        .filter(Boolean)
        .join(". ");
    
    // Embed what the photo shows AND what the user called it.
    // const text = [caption, title, description]
    //     .map(part => (part ?? "").trim())
    //     .filter(Boolean)
    //     .join(". ");

    const embedding = await embedText({ modelId: embeddingModelId, text });

    // Stable key: reprocessing overwrites instead of duplicating.
    const vectorKey = `${imageKey}#caption`;

    const metadata = {
        userId,
        postId,
        imageKey,
        caption,
        kind: "image-caption",
        classifiedAt
    };
    if (title) metadata.title = title;
    if (description) metadata.description = description;

    await s3Vectors.send(new PutVectorsCommand({
        vectorBucketName: vectorBucket,
        indexName: vectorIndex,
        vectors: [{ key: vectorKey, data: { float32: embedding }, metadata }]
    }));

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
                    userId: { $eq: userId }
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