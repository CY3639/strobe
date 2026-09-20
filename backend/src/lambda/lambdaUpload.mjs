import {
    S3Client,
    PutObjectCommand
} from "@aws-sdk/client-s3";

import {
    getSignedUrl
} from "@aws-sdk/s3-request-presigner";

import {
    DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
    DynamoDBDocumentClient,
    GetCommand,
    UpdateCommand
} from "@aws-sdk/lib-dynamodb";

import crypto from "crypto";


// ============================================================
// CONFIGURATION
// ============================================================

const REGION =
    "ap-southeast-2";

const MEDIA_BUCKET =
    process.env.S3UPLOAD_BUCKET;

const POSTS_TABLE =
    process.env.DYNAMODB_POSTS_TABLE;

/*
 * User Story 7:
 * short-lived means no longer than 5 minutes.
 */
const UPLOAD_URL_EXPIRY_SECONDS =
    300;


// ============================================================
// AWS CLIENTS
// ============================================================

const s3 =
    new S3Client({
        region: REGION
    });

const dynamodb =
    DynamoDBDocumentClient.from(
        new DynamoDBClient({
            region: REGION
        })
    );


// ============================================================
// RESPONSE HELPER
// ============================================================

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


// ============================================================
// AUTHENTICATION HELPERS
// ============================================================

function getClaims(event) {

    return (
        event.requestContext
            ?.authorizer
            ?.jwt
            ?.claims ||
        null
    );
}


function getAuthenticatedUser(
    event
) {

    const claims =
        getClaims(event);

    if (!claims?.sub) {
        return null;
    }

    return {
        id:
            claims.sub,

        username:
            claims[
                "cognito:username"
            ] ||
            claims.username ||
            null
    };
}


function requireAuthenticatedUser(
    event
) {

    const user =
        getAuthenticatedUser(
            event
        );

    if (!user) {

        return {
            error:
                response(
                    401,
                    {
                        error:
                            "Unauthorised",

                        message:
                            "Invalid or expired token"
                    }
                )
        };
    }

    return {
        user
    };
}


// ============================================================
// GENERATE SECURE UPLOAD URL
//
// POST /v1/uploads/url
// ============================================================

async function generateUploadUrl(
    event
) {

    // --------------------------------------------------------
    // 1. AUTHENTICATED USER
    // --------------------------------------------------------

    const auth =
        requireAuthenticatedUser(
            event
        );

    if (auth.error) {
        return auth.error;
    }

    const user =
        auth.user;


    // --------------------------------------------------------
    // 2. PARSE REQUEST BODY
    // --------------------------------------------------------

    let body;

    try {

        body =
            JSON.parse(
                event.body ||
                "{}"
            );

    } catch {

        return response(
            400,
            {
                error:
                    "ValidationError",

                message:
                    "Invalid JSON body"
            }
        );
    }

    const purpose = body.purpose === "moment" ? "moment" : "post";
    const contentType = body.contentType || "application/octet-stream"; // moved up

    if (purpose === "moment") {
        const fileId = crypto.randomUUID();
        const objectKey = `${user.id}/moments/${fileId}`;
        const uploadUrl = await getSignedUrl(
            s3,
            new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: objectKey, ContentType: contentType }),
            { expiresIn: UPLOAD_URL_EXPIRY_SECONDS }
        );
        return response(200, { message: "Success", uploadUrl, fileId, key: objectKey });
    }

    const postId = body.postId;


    // --------------------------------------------------------
    // 3. VALIDATE POST ID
    // --------------------------------------------------------

    if (!postId) {

        return response(
            400,
            {
                error:
                    "ValidationError",

                message:
                    "postId is required to generate an upload URL"
            }
        );
    }


    try {

        // ----------------------------------------------------
        // 4. VERIFY POST EXISTS
        // ----------------------------------------------------

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

            return response(
                404,
                {
                    error:
                        "NotFound",

                    message:
                        "Post not found"
                }
            );
        }


        const post =
            postResult.Item;


        // ----------------------------------------------------
        // 5. VERIFY OWNERSHIP
        // ----------------------------------------------------

        if (
            post.userId !==
            user.id
        ) {

            console.log(
                "Upload denied. User:",
                user.id,
                "Post owner:",
                post.userId
            );

            return response(
                403,
                {
                    error:
                        "Forbidden",

                    message:
                        "You can only upload files for your own posts"
                }
            );
        }


        // ----------------------------------------------------
        // 6. GENERATE FILE ID
        // ----------------------------------------------------

        const fileId =
            crypto.randomUUID();


        // ----------------------------------------------------
        // 7. BUILD USER/POST-SCOPED S3 OBJECT KEY
        // ----------------------------------------------------

        /*
         * IMPORTANT:
         *
         * Gradescope expects:
         *
         * userId/postId/fileId
         *
         * NOT:
         *
         * uploads/userId/postId/fileId
         */

        const objectKey =
            `${user.id}/${postId}/${fileId}`;


        // ----------------------------------------------------
        // 8. BUILD S3 PUT OPERATION
        // ----------------------------------------------------

        const putCommand =
            new PutObjectCommand({

                Bucket:
                    MEDIA_BUCKET,

                Key:
                    objectKey,

                ContentType:
                    contentType
            });


        // ----------------------------------------------------
        // 9. GENERATE SHORT-LIVED PRESIGNED URL
        // ----------------------------------------------------

        const uploadUrl =
            await getSignedUrl(
                s3,
                putCommand,
                {
                    expiresIn:
                        UPLOAD_URL_EXPIRY_SECONDS
                }
            );


        // ----------------------------------------------------
        // 10. PERSIST IMAGE REFERENCE TO POST
        // ----------------------------------------------------

        /*
         * The post's images array stores the private S3 key.
         *
         * Do NOT store:
         *
         * - the permanent S3 object URL
         * - the presigned upload URL
         *
         * The key can later be converted into a short-lived
         * presigned GET URL by lambdaPost.
         */

        const updatedPostResult =
            await dynamodb.send(
                new UpdateCommand({

                    TableName:
                        POSTS_TABLE,

                    Key: {
                        id:
                            postId
                    },

                    UpdateExpression:
                        `
                        SET images =
                            list_append(
                                if_not_exists(images, :emptyList),
                                :newImage
                            ),
                            updatedAt = :updatedAt
                        `,

                    /*
                     * Prevent attaching an image reference
                     * to a post belonging to somebody else.
                     */
                    ConditionExpression:
                        "userId = :userId",

                    ExpressionAttributeValues: {

                        ":emptyList":
                            [],

                        ":newImage":
                            [
                                objectKey
                            ],

                        ":updatedAt":
                            new Date()
                                .toISOString(),

                        ":userId":
                            user.id
                    },

                    ReturnValues:
                        "ALL_NEW"
                })
            );


        // ----------------------------------------------------
        // 11. LOG SAFE DEBUG INFORMATION
        // ----------------------------------------------------

        console.log(
            "Presigned upload generated"
        );

        console.log(
            "User:",
            user.id
        );

        console.log(
            "Post:",
            postId
        );

        console.log(
            "File:",
            fileId
        );

        console.log(
            "Object key:",
            objectKey
        );

        console.log(
            "Content type:",
            contentType
        );

        console.log(
            "Image reference attached to post:",
            objectKey
        );

        console.log(
            "Post images:",
            updatedPostResult
                .Attributes
                ?.images
        );

        console.log(
            "Expires in:",
            UPLOAD_URL_EXPIRY_SECONDS,
            "seconds"
        );


        /*
         * Do NOT log uploadUrl.
         *
         * It contains temporary S3 authorization information.
         */


        // ----------------------------------------------------
        // 12. PRESERVE RESPONSE CONTRACT
        // ----------------------------------------------------

        return response(
            200,
            {
                message:
                    "Success",

                uploadUrl,

                fileId,

                key:
                    objectKey
            }
        );


    } catch (error) {

        console.error(
            "Generate upload URL error:",
            error
        );

        if (
            error.name ===
            "ConditionalCheckFailedException"
        ) {

            return response(
                403,
                {
                    error:
                        "Forbidden",

                    message:
                        "You can only upload files for your own posts"
                }
            );
        }

        return response(
            500,
            {
                error:
                    "InternalServerError",

                message:
                    "Internal server error"
            }
        );
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
            "Upload Lambda invoked"
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
            getClaims(event);

        if (claims) {

            console.log(
                "Authenticated Cognito sub:",
                claims.sub
            );

        } else {

            console.log(
                "No JWT claims available"
            );
        }


        console.log(
            "========================================"
        );


        // ----------------------------------------------------
        // GENERATE UPLOAD URL
        // ----------------------------------------------------

        if (
            event.routeKey ===
            "POST /v1/uploads/url"
        ) {

            return await generateUploadUrl(
                event
            );
        }


        // ----------------------------------------------------
        // UNKNOWN UPLOAD ROUTE
        // ----------------------------------------------------

        console.warn(
            "Unrecognised upload route:",
            event.routeKey
        );

        return response(
            404,
            {
                error:
                    "NotFound",

                message:
                    "Route not found"
            }
        );
    };