import {
    DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand,
    ScanCommand
} from "@aws-sdk/lib-dynamodb";

import crypto from "crypto";


// ============================================================
// CONFIGURATION
// ============================================================

const REGION = "ap-southeast-2";

const POSTS_TABLE =
    process.env.DYNAMODB_POSTS_TABLE;

const COMMENTS_TABLE =
    process.env.DYNAMODB_COMMENTS_TABLE;

const LIKES_TABLE =
    process.env.DYNAMODB_LIKES_TABLE;

const USERS_TABLE =
    process.env.DYNAMODB_USERS_TABLE;


// ============================================================
// AWS CLIENT
// ============================================================

const dynamodb =
    DynamoDBDocumentClient.from(
        new DynamoDBClient({
            region: REGION
        })
    );


// ============================================================
// RESPONSE HELPER
// ============================================================

function response(statusCode, body) {

    return {
        statusCode,

        headers: {
            "content-type":
                "application/json"
        },

        body:
            JSON.stringify(body)
    };
}


// ============================================================
// AUTH HELPERS
// ============================================================

function getGroupsFromClaims(claims) {

    const rawGroups =
        claims?.["cognito:groups"];


    if (!rawGroups) {
        return [];
    }


    if (Array.isArray(rawGroups)) {
        return rawGroups;
    }


    return String(rawGroups)
        .replace("[", "")
        .replace("]", "")
        .split(",")
        .map(
            group =>
                group.trim()
        )
        .filter(Boolean);
}


function getAuthenticatedUser(event) {

    const claims =
        event.requestContext
            ?.authorizer
            ?.jwt
            ?.claims;


    if (!claims?.sub) {
        return null;
    }


    return {
        id:
            claims.sub,

        username:
            claims.email ||
            claims.username ||
            claims["cognito:username"] ||
            null,

        groups:
            getGroupsFromClaims(
                claims
            )
    };
}


function requireAuthenticatedUser(event) {

    const user =
        getAuthenticatedUser(
            event
        );


    if (!user) {

        return {
            error:
                response(401, {
                    message:
                        "Unauthorized"
                })
        };
    }


    return {
        user
    };
}


// ============================================================
// USER / AUTHOR HELPERS
// ============================================================

async function getUserById(userId) {

    if (
        !USERS_TABLE ||
        !userId
    ) {
        return null;
    }


    try {

        const result =
            await dynamodb.send(
                new GetCommand({
                    TableName:
                        USERS_TABLE,

                    Key: {
                        id:
                            userId
                    }
                })
            );


        return result.Item || null;


    } catch (error) {

        console.error(
            "Get user for author error:",
            error
        );


        return null;
    }
}


function makeAuthor(user) {

    if (!user) {
        return null;
    }


    return {
        id:
            user.id,

        username:
            user.username ||
            user.email ||
            null
    };
}


async function enrichPostWithAuthor(post) {

    if (!post) {
        return post;
    }


    const user =
        await getUserById(
            post.userId
        );


    if (!user) {

        console.error(
            "Unable to find author for post:",
            post.id,
            "userId:",
            post.userId
        );


        return {
            ...post,

            author: {
                id:
                    post.userId,

                username:
                    null
            }
        };
    }


    return {
        ...post,

        author:
            makeAuthor(user)
    };
}


async function enrichPostsWithAuthors(posts) {

    return Promise.all(
        posts.map(
            post =>
                enrichPostWithAuthor(
                    post
                )
        )
    );
}


// ============================================================
// CREATE POST
//
// POST /v1/posts
// ============================================================

async function createPost(event) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {
        return auth.error;
    }


    const user =
        auth.user;


    let body;


    try {

        body =
            JSON.parse(
                event.body ||
                "{}"
            );

    } catch {

        return response(400, {
            message:
                "Invalid JSON body"
        });
    }


    const title =
        body.title;

    const description =
        body.description;

    const images =
        Array.isArray(
            body.images
        )
            ? body.images
            : [];


    if (!title) {

        return response(400, {
            message:
                "Title is required"
        });
    }


    const now =
        new Date()
            .toISOString();


    const post = {

        id:
            crypto.randomUUID(),

        userId:
            user.id,

        title,

        description:
            description || "",

        images,

        status:
            "active",

        createdAt:
            now,

        updatedAt:
            now
    };


    try {

        await dynamodb.send(
            new PutCommand({

                TableName:
                    POSTS_TABLE,

                Item:
                    post,

                ConditionExpression:
                    "attribute_not_exists(id)"
            })
        );


        const responsePost =
            await enrichPostWithAuthor(
                post
            );


        return response(
            201,
            responsePost
        );


    } catch (error) {

        console.error(
            "Create post error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// GET POST
//
// GET /v1/posts/{id}
// ============================================================

async function getPost(event) {

    const postId =
        event.pathParameters?.id;


    if (!postId) {

        return response(400, {
            message:
                "Post ID is required"
        });
    }


    try {

        const result =
            await dynamodb.send(
                new GetCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    }
                })
            );


        if (!result.Item) {

            return response(404, {
                message:
                    "Post not found"
            });
        }


        const post =
            await enrichPostWithAuthor(
                result.Item
            );


        return response(
            200,
            post
        );


    } catch (error) {

        console.error(
            "Get post error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// GET POSTS BY USER
//
// GET /v1/posts/user/{userId}
// ============================================================

async function getPostsByUser(event) {

    const userId =
        event.pathParameters
            ?.userId;


    if (!userId) {

        return response(400, {
            message:
                "User ID is required"
        });
    }


    try {

        const result =
            await dynamodb.send(
                new ScanCommand({

                    TableName:
                        POSTS_TABLE,

                    FilterExpression:
                        "userId = :userId",

                    ExpressionAttributeValues: {
                        ":userId":
                            userId
                    }
                })
            );


        let posts =
            result.Items || [];


        posts.sort(
            (a, b) =>

                new Date(
                    b.createdAt || 0
                ).getTime()

                -

                new Date(
                    a.createdAt || 0
                ).getTime()
        );


        posts =
            await enrichPostsWithAuthors(
                posts
            );


        return response(
            200,
            posts
        );


    } catch (error) {

        console.error(
            "Get posts by user error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// UPDATE POST
//
// PUT /v1/posts/{id}
// ============================================================

async function updatePost(event) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {
        return auth.error;
    }


    const user =
        auth.user;

    const postId =
        event.pathParameters?.id;


    if (!postId) {

        return response(400, {
            message:
                "Post ID is required"
        });
    }


    let body;


    try {

        body =
            JSON.parse(
                event.body ||
                "{}"
            );

    } catch {

        return response(400, {
            message:
                "Invalid JSON body"
        });
    }


    try {

        const existing =
            await dynamodb.send(
                new GetCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    }
                })
            );


        if (!existing.Item) {

            return response(404, {
                message:
                    "Post not found"
            });
        }


        if (
            existing.Item.userId !==
            user.id
        ) {

            return response(403, {
                message:
                    "Forbidden"
            });
        }


        const result =
            await dynamodb.send(
                new UpdateCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    },

                    UpdateExpression:
                        "SET title = :title, description = :description, updatedAt = :updatedAt",

                    ExpressionAttributeValues: {

                        ":title":
                            body.title ??
                            existing.Item.title,

                        ":description":
                            body.description ??
                            existing.Item.description,

                        ":updatedAt":
                            new Date()
                                .toISOString()
                    },

                    ReturnValues:
                        "ALL_NEW"
                })
            );


        const updatedPost =
            await enrichPostWithAuthor(
                result.Attributes
            );


        return response(
            200,
            updatedPost
        );


    } catch (error) {

        console.error(
            "Update post error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// DELETE POST
//
// DELETE /v1/posts/{id}
// ============================================================

async function deletePost(event) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {
        return auth.error;
    }


    const user =
        auth.user;

    const postId =
        event.pathParameters?.id;


    if (!postId) {

        return response(400, {
            message:
                "Post ID is required"
        });
    }


    try {

        const existing =
            await dynamodb.send(
                new GetCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    }
                })
            );


        if (!existing.Item) {

            return response(404, {
                message:
                    "Post not found"
            });
        }


        if (
            existing.Item.userId !==
            user.id
        ) {

            return response(403, {
                message:
                    "Forbidden"
            });
        }


        await dynamodb.send(
            new DeleteCommand({

                TableName:
                    POSTS_TABLE,

                Key: {
                    id:
                        postId
                }
            })
        );


        return response(200, {
            message:
                "Post deleted"
        });


    } catch (error) {

        console.error(
            "Delete post error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// HIDE POST — MODERATOR ONLY
//
// POST /v1/posts/{id}/hide
// ============================================================

async function hidePost(event) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {
        return auth.error;
    }


    const user =
        auth.user;


    if (
        !user.groups.includes(
            "moderator"
        )
    ) {

        return response(403, {
            message:
                "Forbidden"
        });
    }


    const postId =
        event.pathParameters?.id;


    if (!postId) {

        return response(400, {
            message:
                "Post ID is required"
        });
    }


    try {

        const existing =
            await dynamodb.send(
                new GetCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    }
                })
            );


        if (!existing.Item) {

            return response(404, {
                message:
                    "Post not found"
            });
        }


        const result =
            await dynamodb.send(
                new UpdateCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    },

                    UpdateExpression:
                        "SET #status = :status, updatedAt = :updatedAt",

                    ExpressionAttributeNames: {
                        "#status":
                            "status"
                    },

                    ExpressionAttributeValues: {

                        ":status":
                            "hidden",

                        ":updatedAt":
                            new Date()
                                .toISOString()
                    },

                    ReturnValues:
                        "ALL_NEW"
                })
            );


        const hiddenPost =
            await enrichPostWithAuthor(
                result.Attributes
            );


        return response(
            200,
            hiddenPost
        );


    } catch (error) {

        console.error(
            "Hide post error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// CREATE COMMENT
//
// POST /v1/posts/{postId}/comments
// ============================================================

async function createComment(event) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {
        return auth.error;
    }


    const user =
        auth.user;

    const postId =
        event.pathParameters
            ?.postId;


    if (!postId) {

        return response(400, {
            message:
                "Post ID is required"
        });
    }


    let body;


    try {

        body =
            JSON.parse(
                event.body ||
                "{}"
            );

    } catch {

        return response(400, {
            message:
                "Invalid JSON body"
        });
    }


    const text =
        body.text?.trim();


    if (!text) {

        return response(400, {
            message:
                "Comment text is required"
        });
    }


    try {

        const postResult =
            await dynamodb.send(
                new GetCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    }
                })
            );


        if (!postResult.Item) {

            return response(404, {
                message:
                    "Post not found"
            });
        }


        const now =
            new Date()
                .toISOString();


        const comment = {

            id:
                crypto.randomUUID(),

            postId,

            userId:
                user.id,

            text,

            createdAt:
                now,

            updatedAt:
                now
        };


        await dynamodb.send(
            new PutCommand({

                TableName:
                    COMMENTS_TABLE,

                Item:
                    comment,

                ConditionExpression:
                    "attribute_not_exists(id)"
            })
        );


        return response(
            201,
            comment
        );


    } catch (error) {

        console.error(
            "Create comment error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// GET COMMENTS
//
// GET /v1/posts/{postId}/comments
// ============================================================

async function getComments(event) {

    const postId =
        event.pathParameters
            ?.postId;


    if (!postId) {

        return response(400, {
            message:
                "Post ID is required"
        });
    }


    try {

        const postResult =
            await dynamodb.send(
                new GetCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    }
                })
            );


        if (!postResult.Item) {

            return response(404, {
                message:
                    "Post not found"
            });
        }


        const result =
            await dynamodb.send(
                new ScanCommand({

                    TableName:
                        COMMENTS_TABLE,

                    FilterExpression:
                        "postId = :postId",

                    ExpressionAttributeValues: {
                        ":postId":
                            postId
                    }
                })
            );


        const comments =
            result.Items || [];


        comments.sort(
            (a, b) =>

                new Date(
                    a.createdAt || 0
                ).getTime()

                -

                new Date(
                    b.createdAt || 0
                ).getTime()
        );


        return response(
            200,
            comments
        );


    } catch (error) {

        console.error(
            "Get comments error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// DELETE COMMENT
//
// DELETE /v1/posts/{postId}/comments/{commentId}
// ============================================================

async function deleteComment(event) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {
        return auth.error;
    }


    const user =
        auth.user;

    const postId =
        event.pathParameters
            ?.postId;

    const commentId =
        event.pathParameters
            ?.commentId;


    if (
        !postId ||
        !commentId
    ) {

        return response(400, {
            message:
                "Post ID and Comment ID are required"
        });
    }


    try {

        const commentResult =
            await dynamodb.send(
                new GetCommand({

                    TableName:
                        COMMENTS_TABLE,

                    Key: {
                        id:
                            commentId
                    }
                })
            );


        if (!commentResult.Item) {

            return response(404, {
                message:
                    "Comment not found"
            });
        }


        const comment =
            commentResult.Item;


        if (
            comment.postId !==
            postId
        ) {

            return response(404, {
                message:
                    "Comment not found"
            });
        }


        if (
            comment.userId !==
            user.id
        ) {

            return response(403, {
                message:
                    "Forbidden"
            });
        }


        await dynamodb.send(
            new DeleteCommand({

                TableName:
                    COMMENTS_TABLE,

                Key: {
                    id:
                        commentId
                }
            })
        );


        return response(200, {
            message:
                "Comment deleted"
        });


    } catch (error) {

        console.error(
            "Delete comment error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// LIKE POST
//
// POST /v1/posts/{id}/like
// ============================================================

async function likePost(event) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {
        return auth.error;
    }


    const user =
        auth.user;

    const postId =
        event.pathParameters?.id;


    if (!postId) {

        return response(400, {
            message:
                "Post ID is required"
        });
    }


    try {

        const postResult =
            await dynamodb.send(
                new GetCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    }
                })
            );


        if (!postResult.Item) {

            return response(404, {
                message:
                    "Post not found"
            });
        }


        const like = {

            id:
                crypto.randomUUID(),

            postId,

            userId:
                user.id,

            createdAt:
                new Date()
                    .toISOString()
        };


        await dynamodb.send(
            new PutCommand({

                TableName:
                    LIKES_TABLE,

                Item:
                    like,

                ConditionExpression:
                    "attribute_not_exists(postId) AND attribute_not_exists(userId)"
            })
        );


        return response(
            201,
            like
        );


    } catch (error) {

        if (
            error.name ===
            "ConditionalCheckFailedException"
        ) {

            return response(409, {
                message:
                    "Post already liked"
            });
        }


        console.error(
            "Like post error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// UNLIKE POST
//
// DELETE /v1/posts/{id}/like
// ============================================================

async function unlikePost(event) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {
        return auth.error;
    }


    const user =
        auth.user;

    const postId =
        event.pathParameters?.id;


    if (!postId) {

        return response(400, {
            message:
                "Post ID is required"
        });
    }


    try {

        const postResult =
            await dynamodb.send(
                new GetCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    }
                })
            );


        if (!postResult.Item) {

            return response(404, {
                message:
                    "Post not found"
            });
        }


        const result =
            await dynamodb.send(
                new DeleteCommand({

                    TableName:
                        LIKES_TABLE,

                    Key: {
                        postId:
                            postId,

                        userId:
                            user.id
                    },

                    ReturnValues:
                        "ALL_OLD"
                })
            );


        if (!result.Attributes) {

            return response(404, {
                message:
                    "Like not found"
            });
        }


        return response(200, {
            message:
                "Post unliked"
        });


    } catch (error) {

        console.error(
            "Unlike post error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// ============================================================
// MAIN HANDLER
// ============================================================

export const handler =
    async (event) => {


        console.log(
            "========================================"
        );

        console.log(
            "Post Lambda invoked"
        );

        console.log(
            "Route:",
            event.routeKey
        );

        console.log(
            "Method:",
            event.requestContext
                ?.http
                ?.method
        );


        const claims =
            event.requestContext
                ?.authorizer
                ?.jwt
                ?.claims;


        if (claims) {

            console.log(
                "Authenticated Cognito sub:",
                claims.sub
            );

            console.log(
                "Cognito groups:",
                claims[
                    "cognito:groups"
                ]
            );

        } else {

            console.log(
                "No JWT claims available"
            );
        }


        console.log(
            "========================================"
        );


        // CREATE POST

        if (
            event.routeKey ===
            "POST /v1/posts"
        ) {

            return await createPost(
                event
            );
        }


        // POSTS BY USER

        if (
            event.routeKey ===
            "GET /v1/posts/user/{userId}"
        ) {

            return await getPostsByUser(
                event
            );
        }


        // GET POST

        if (
            event.routeKey ===
            "GET /v1/posts/{id}"
        ) {

            return await getPost(
                event
            );
        }


        // UPDATE POST

        if (
            event.routeKey ===
            "PUT /v1/posts/{id}"
        ) {

            return await updatePost(
                event
            );
        }


        // DELETE POST

        if (
            event.routeKey ===
            "DELETE /v1/posts/{id}"
        ) {

            return await deletePost(
                event
            );
        }


        // LIKE POST

        if (
            event.routeKey ===
            "POST /v1/posts/{id}/like"
        ) {

            return await likePost(
                event
            );
        }


        // UNLIKE POST

        if (
            event.routeKey ===
            "DELETE /v1/posts/{id}/like"
        ) {

            return await unlikePost(
                event
            );
        }


        // HIDE POST

        if (
            event.routeKey ===
            "POST /v1/posts/{id}/hide"
        ) {

            return await hidePost(
                event
            );
        }


        // CREATE COMMENT

        if (
            event.routeKey ===
            "POST /v1/posts/{postId}/comments"
        ) {

            return await createComment(
                event
            );
        }


        // GET COMMENTS

        if (
            event.routeKey ===
            "GET /v1/posts/{postId}/comments"
        ) {

            return await getComments(
                event
            );
        }


        // DELETE COMMENT

        if (
            event.routeKey ===
            "DELETE /v1/posts/{postId}/comments/{commentId}"
        ) {

            return await deleteComment(
                event
            );
        }


        // UNKNOWN ROUTE

        console.warn(
            "Unrecognised post route:",
            event.routeKey
        );


        return response(404, {
            message:
                "Route not found"
        });
    };