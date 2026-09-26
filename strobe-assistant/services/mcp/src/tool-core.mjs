import {
    GetCommand
} from "@aws-sdk/lib-dynamodb";

import {
    GetObjectCommand
} from "@aws-sdk/client-s3";

import {
    getSignedUrl
} from "@aws-sdk/s3-request-presigner";

import {
    dynamodb,
    s3
} from "../../../src/shared/aws.mjs";

import {
    loadConfig
} from "../../../src/shared/config.mjs";

import {
    searchUserMedia
} from "../../../src/shared/vectors.mjs";


export async function searchUserMediaTool({
    authenticatedUserId,
    query,
    topK = 5
}) {

    if (!authenticatedUserId) {

        throw new Error(
            "Authenticated user ID is required."
        );
    }


    if (
        typeof query !== "string"
        ||
        query.trim().length === 0
    ) {

        throw new Error(
            "query must be a non-empty string."
        );
    }


    const config =
        await loadConfig();


    const matches =
        await searchUserMedia({
            embeddingModelId:
                config.embeddingModelId,

            vectorBucket:
                config.vectorBucket,

            vectorIndex:
                config.vectorIndex,

            userId:
                authenticatedUserId,

            query:
                query.trim(),

            topK
        });


    return {
        query:
            query.trim(),

        count:
            matches.length,

        matches
    };
}


export async function getPostTool({
    authenticatedUserId,
    postId
}) {

    const config =
        await loadConfig();


    const response =
        await dynamodb.send(
            new GetCommand({
                TableName:
                    config.postsTable,

                Key: {
                    id:
                        postId
                }
            })
        );


    const post =
        response.Item;


    if (!post) {

        throw new Error(
            "Post not found."
        );
    }


    if (
        post.userId
        !==
        authenticatedUserId
    ) {

        throw new Error(
            "Forbidden."
        );
    }


    return {
        id:
            post.id,

        userId:
            post.userId,

        title:
            post.title,

        description:
            post.description,

        images:
            post.images,

        createdAt:
            post.createdAt,

        updatedAt:
            post.updatedAt,

        status:
            post.status
    };
}


export async function getImageUrlTool({
    authenticatedUserId,
    imageKey
}) {

    const config =
        await loadConfig();


    /*
     * Classification table doubles as the stable mapping between
     * a searchable image and its owner.
     */
    const response =
        await dynamodb.send(
            new GetCommand({
                TableName:
                    config.classificationsTable,

                Key: {
                    imageKey
                }
            })
        );


    const classification =
        response.Item;


    if (!classification) {

        throw new Error(
            "Image classification not found."
        );
    }


    if (
        classification.userId
        !==
        authenticatedUserId
    ) {

        throw new Error(
            "Forbidden."
        );
    }


    const expiresIn =
        300;


    const url =
        await getSignedUrl(
            s3,

            new GetObjectCommand({
                Bucket:
                    config.uploadsBucket,

                Key:
                    imageKey
            }),

            {
                expiresIn
            }
        );


    return {
        imageKey,

        url,

        expiresInSeconds:
            expiresIn
    };
}