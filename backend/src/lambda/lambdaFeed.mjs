import {
    DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
    DynamoDBDocumentClient,
    ScanCommand
} from "@aws-sdk/lib-dynamodb";

import {
    S3Client,
    GetObjectCommand
} from "@aws-sdk/client-s3";

import {
    getSignedUrl
} from "@aws-sdk/s3-request-presigner";


// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const REGION = "ap-southeast-2";

const POSTS_TABLE =
    process.env.DYNAMODB_POSTS_TABLE;

const FOLLOWS_TABLE =
    process.env.DYNAMODB_FOLLOWS_TABLE;

const USERS_TABLE =
    process.env.DYNAMODB_USERS_TABLE;

const LIKES_TABLE =
    process.env.DYNAMODB_LIKES_TABLE;

const COMMENTS_TABLE =
    process.env.DYNAMODB_COMMENTS_TABLE;

const MEDIA_BUCKET =
    process.env.S3_MEDIA_BUCKET;


// Short-lived media read URL.
// 300 seconds = 5 minutes.

const MEDIA_URL_EXPIRY_SECONDS = 300;


// --------------------------------------------------
// AWS CLIENTS
// --------------------------------------------------

const dynamodb =
    DynamoDBDocumentClient.from(
        new DynamoDBClient({
            region: REGION
        })
    );


const s3 =
    new S3Client({
        region: REGION
    });


// --------------------------------------------------
// RESPONSE HELPER
// --------------------------------------------------

function response(
    statusCode,
    body
) {

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


// --------------------------------------------------
// COGNITO GROUP PARSER
// --------------------------------------------------

function getGroupsFromClaims(
    claims
) {

    const rawGroups =
        claims?.["cognito:groups"];


    if (!rawGroups) {

        return [];
    }


    if (
        Array.isArray(rawGroups)
    ) {

        return rawGroups;
    }


    /*
     * API Gateway may expose Cognito groups
     * as strings such as:
     *
     * moderator
     * [moderator]
     * [moderator,user]
     */

    return String(rawGroups)
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .split(",")
        .map(group =>
            group
                .trim()
                .replace(
                    /^["']|["']$/g,
                    ""
                )
        )
        .filter(Boolean);
}


// --------------------------------------------------
// AUTHENTICATED USER
// --------------------------------------------------

function requireAuthenticatedUser(
    event
) {

    const claims =
        event.requestContext
            ?.authorizer
            ?.jwt
            ?.claims;


    if (!claims?.sub) {

        return {
            error:
                response(
                    401,
                    {
                        message:
                            "Unauthorized"
                    }
                )
        };
    }


    return {
        user: {
            id:
                claims.sub,

            email:
                claims.email ??
                null,

            username:
                claims[
                    "cognito:username"
                ] ??
                claims.username ??
                claims.email ??
                null,

            groups:
                getGroupsFromClaims(
                    claims
                )
        }
    };
}


// --------------------------------------------------
// SCAN ENTIRE TABLE
//
// DynamoDB Scan can return only part of a table.
// This helper follows LastEvaluatedKey until done.
// --------------------------------------------------

async function scanAll(
    params
) {

    const items = [];

    let ExclusiveStartKey;


    do {

        const result =
            await dynamodb.send(
                new ScanCommand({
                    ...params,

                    ExclusiveStartKey
                })
            );


        items.push(
            ...(result.Items || [])
        );


        ExclusiveStartKey =
            result.LastEvaluatedKey;


    } while (
        ExclusiveStartKey
    );


    return items;
}


// --------------------------------------------------
// PAGINATION
// --------------------------------------------------

function getPagination(
    event
) {

    const query =
        event.queryStringParameters ||
        {};


    let limit =
        Number.parseInt(
            query.limit,
            10
        );


    let offset =
        Number.parseInt(
            query.offset,
            10
        );


    if (
        !Number.isFinite(limit)
    ) {

        limit = 20;
    }


    if (
        !Number.isFinite(offset)
    ) {

        offset = 0;
    }


    /*
     * Match original Strobe behaviour:
     *
     * limit: 1..100
     * offset: >= 0
     */

    limit =
        Math.min(
            Math.max(
                limit,
                1
            ),
            100
        );


    offset =
        Math.max(
            offset,
            0
        );


    return {
        limit,
        offset
    };
}


// --------------------------------------------------
// GET FOLLOWED USER IDS
// --------------------------------------------------

async function getFollowingIds(
    userId
) {

    const follows =
        await scanAll({
            TableName:
                FOLLOWS_TABLE,

            FilterExpression:
                "followerId = :userId",

            ExpressionAttributeValues: {
                ":userId":
                    userId
            }
        });


    return follows
        .map(
            follow =>
                follow.followeeId
        )
        .filter(Boolean);
}


// --------------------------------------------------
// FIND AUTHOR
// --------------------------------------------------

async function findUserById(
    userId
) {

    /*
     * Scan is intentionally used here because
     * this code remains compatible even if your
     * Users table primary key is not "id".
     *
     * For a production system you should use
     * Get/Query with an appropriate key/index.
     */

    const users =
        await scanAll({
            TableName:
                USERS_TABLE,

            FilterExpression:
                "id = :userId",

            ExpressionAttributeValues: {
                ":userId":
                    userId
            }
        });


    return users[0] || null;
}


// --------------------------------------------------
// GET LIKES FOR POST
// --------------------------------------------------

async function getPostLikes(
    postId
) {

    return await scanAll({
        TableName:
            LIKES_TABLE,

        FilterExpression:
            "postId = :postId",

        ExpressionAttributeValues: {
            ":postId":
                postId
        }
    });
}


// --------------------------------------------------
// GET COMMENTS FOR POST
// --------------------------------------------------

async function getPostComments(
    postId
) {

    return await scanAll({
        TableName:
            COMMENTS_TABLE,

        FilterExpression:
            "postId = :postId",

        ExpressionAttributeValues: {
            ":postId":
                postId
        }
    });
}


// --------------------------------------------------
// CONVERT STORED IMAGE REFERENCE TO S3 KEY
// --------------------------------------------------

function imageReferenceToKey(
    imageReference
) {

    if (
        !imageReference ||
        typeof imageReference !==
        "string"
    ) {

        return null;
    }


    /*
     * Preferred DynamoDB value:
     *
     * uploads/userId/postId/fileId.jpg
     */

    if (
        !imageReference.startsWith(
            "http://"
        ) &&
        !imageReference.startsWith(
            "https://"
        )
    ) {

        return imageReference
            .replace(
                /^\/+/,
                ""
            );
    }


    /*
     * Compatibility:
     *
     * If an older record contains a URL,
     * extract the path and use it as the
     * S3 object key.
     */

    try {

        const parsed =
            new URL(
                imageReference
            );


        return decodeURIComponent(
            parsed.pathname
                .replace(
                    /^\/+/,
                    ""
                )
        );


    } catch {

        return null;
    }
}


// --------------------------------------------------
// GENERATE TEMPORARY MEDIA URL
// --------------------------------------------------

async function createMediaReadUrl(
    imageReference
) {

    const key =
        imageReferenceToKey(
            imageReference
        );


    if (!key) {

        return imageReference;
    }


    try {

        const command =
            new GetObjectCommand({
                Bucket:
                    MEDIA_BUCKET,

                Key:
                    key
            });


        return await getSignedUrl(
            s3,
            command,
            {
                expiresIn:
                    MEDIA_URL_EXPIRY_SECONDS
            }
        );


    } catch (error) {

        console.error(
            "Could not create media URL:",
            key,
            error
        );


        /*
         * We do not fail the entire feed just
         * because one image reference is bad.
         */

        return null;
    }
}


// --------------------------------------------------
// SIGN POST IMAGES
// --------------------------------------------------

async function attachMediaUrls(
    post
) {

    if (
        !Array.isArray(
            post.images
        )
    ) {

        return {
            ...post,
            images: []
        };
    }


    const images =
        await Promise.all(
            post.images.map(
                image =>
                    createMediaReadUrl(
                        image
                    )
            )
        );


    return {
        ...post,

        images:
            images.filter(
                Boolean
            )
    };
}


// --------------------------------------------------
// ENRICH POST
// --------------------------------------------------

async function enrichPost(
    post,
    currentUserId
) {

    const [
        author,
        likes,
        comments,
        mediaPost
    ] =
        await Promise.all([
            findUserById(
                post.userId
            ),

            getPostLikes(
                post.id
            ),

            getPostComments(
                post.id
            ),

            attachMediaUrls(
                post
            )
        ]);


    const currentUserLiked =
        likes.some(
            like =>
                like.userId ===
                currentUserId
        );


    return {
        ...mediaPost,

        author:
            author
                ? {
                    id:
                        author.id,

                    username:
                        author.username
                }
                : null,

        stats: {
            likes:
                likes.length,

            comments:
                comments.length
        },

        currentUserLiked
    };
}


// --------------------------------------------------
// GET FEED
// GET /v1/feed
// --------------------------------------------------

async function getFeed(
    event
) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (
        auth.error
    ) {

        return auth.error;
    }


    const user =
        auth.user;


    const {
        limit,
        offset
    } =
        getPagination(
            event
        );


    try {

        // ------------------------------------------
        // 1. FIND USERS CURRENT USER FOLLOWS
        // ------------------------------------------

        const followingIds =
            await getFollowingIds(
                user.id
            );


        console.log(
            "Following IDs:",
            followingIds
        );


        /*
         * Match original Strobe behaviour:
         * no followed users = empty feed.
         */

        if (
            followingIds.length === 0
        ) {

            return response(
                200,
                {
                    message:
                        "Success",

                    posts:
                        []
                }
            );
        }


        const followingSet =
            new Set(
                followingIds
            );


        // ------------------------------------------
        // 2. GET POSTS
        // ------------------------------------------

        const allPosts =
            await scanAll({
                TableName:
                    POSTS_TABLE
            });


        let posts =
            allPosts.filter(
                post =>
                    followingSet.has(
                        post.userId
                    )
            );


        // ------------------------------------------
        // 3. VISIBILITY
        // ------------------------------------------

        const isModerator =
            user.groups.includes(
                "moderator"
            );


        if (
            !isModerator
        ) {

            posts =
                posts.filter(
                    post =>
                        post.status !==
                        "hidden"
                );
        }


        // ------------------------------------------
        // 4. NEWEST FIRST
        // ------------------------------------------

        posts.sort(
            (a, b) => {

                const aTime =
                    new Date(
                        a.createdAt ||
                        0
                    ).getTime();


                const bTime =
                    new Date(
                        b.createdAt ||
                        0
                    ).getTime();


                return (
                    bTime -
                    aTime
                );
            }
        );


        // ------------------------------------------
        // 5. PAGINATION
        // ------------------------------------------

        posts =
            posts.slice(
                offset,
                offset + limit
            );


        // ------------------------------------------
        // 6. ENRICH
        // ------------------------------------------

        const enrichedPosts =
            await Promise.all(
                posts.map(
                    post =>
                        enrichPost(
                            post,
                            user.id
                        )
                )
            );


        console.log(
            "Feed returned",
            enrichedPosts.length,
            "posts for:",
            user.id
        );


        return response(
            200,
            {
                message:
                    "Success",

                posts:
                    enrichedPosts
            }
        );


    } catch (error) {

        console.error(
            "Get feed error:",
            error
        );


        return response(
            500,
            {
                message:
                    "Internal server error"
            }
        );
    }
}


// --------------------------------------------------
// MAIN LAMBDA HANDLER
// --------------------------------------------------

export const handler =
async (event) => {

    console.log(
        "========================================"
    );

    console.log(
        "Feed Lambda invoked"
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


        console.log(
            "Parsed groups:",
            getGroupsFromClaims(
                claims
            )
        );

    } else {

        console.log(
            "No JWT claims available"
        );
    }


    console.log(
        "========================================"
    );


    if (
        event.routeKey ===
        "GET /v1/feed"
    ) {

        return await getFeed(
            event
        );
    }


    return response(
        404,
        {
            message:
                "Route not found"
        }
    );
};