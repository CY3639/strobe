import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { dynamodb, s3 } from "../../../src/shared/aws.mjs";
import { loadConfig } from "../../../src/shared/config.mjs";
import { searchUserMedia } from "../../../src/shared/vectors.mjs";


/*
 * Errors that are safe to show the model. Anything else is
 * logged in full but reported as a generic failure, so AWS
 * internals never leak into a chat.
 */
export class ToolError extends Error {}

// Measured in Phase 4: correct scene-style matches were 0.14-0.47.
const URL_LIFETIME_SECONDS = 300;


/*
 * One rule for every post lookup: missing and not-yours give the
 * SAME answer, so the tool can't be used to discover whether
 * another user's post ID exists.
 */
async function getOwnedPost(config, postId, userId) {
    const { Item: post } = await dynamodb.send(new GetCommand({
        TableName: config.postsTable,
        Key: { id: postId }
    }));

    if (!post || post.userId !== userId) {
        throw new ToolError("Post not found.");
    }
    return post;
}


export async function searchUserMediaTool({ authenticatedUserId, query, topK = 5 }) {
    const config = await loadConfig();

    const matches = await searchUserMedia({
        embeddingModelId: config.embeddingModelId,
        vectorBucket: config.vectorBucket,
        vectorIndex: config.vectorIndex,
        userId: authenticatedUserId,     // the isolation boundary
        query: query.trim(),
        topK
    });

    // A1 deletes posts without deleting their vectors: drop orphans.
    const posts = await Promise.all(matches.map(match =>
        getOwnedPost(config, match.metadata.postId, authenticatedUserId).catch(() => null)
    ));

    const results = matches
        .map((match, i) => ({ match, post: posts[i] }))
        .filter(({ post }) => post)
        .map(({ match, post }) => ({
            postId: post.id,
            imageKey: match.metadata.imageKey,
            caption: match.metadata.caption,
            postTitle: post.title ?? null,
            distance: Number(match.distance.toFixed(3)),
        }));

    return {
        query: query.trim(),
        count: results.length,
        results,
        note: "Results are ranked by similarity, but the top result is not always relevant. Judge each one by its caption."
    };
}


export async function getPostTool({ authenticatedUserId, postId }) {
    const config = await loadConfig();
    const post = await getOwnedPost(config, postId, authenticatedUserId);

    return {
        postId: post.id,
        title: post.title ?? "",
        description: post.description ?? "",
        imageKeys: post.images ?? [],
        createdAt: post.createdAt,
        status: post.status
    };
}


export async function getImageUrlTool({ authenticatedUserId, imageKey }) {
    const config = await loadConfig();

    // lambdaUpload mints every key as <ownerId>/<postId>/<fileId>,
    // so the first segment IS the owner.
    const parts = imageKey.split("/");
    if (parts.length !== 3 || parts[0] !== authenticatedUserId) {
        throw new ToolError("Image not found.");
    }

    const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: config.uploadsBucket, Key: imageKey }),
        { expiresIn: URL_LIFETIME_SECONDS }
    );

    return { imageKey, url, expiresInSeconds: URL_LIFETIME_SECONDS };
}