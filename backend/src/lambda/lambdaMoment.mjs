import {
    DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    ScanCommand,
    UpdateCommand,
    DeleteCommand
} from "@aws-sdk/lib-dynamodb";

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import crypto from "crypto";


const dynamodb = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        region: "ap-southeast-2"
    })
);


const MOMENTS_TABLE =
    process.env.DYNAMODB_MOMENTS_TABLE;

const FOLLOWS_TABLE =
    process.env.DYNAMODB_FOLLOWS_TABLE;

const MEDIA_BUCKET = process.env.S3_MEDIA_BUCKET;
const MEDIA_URL_EXPIRY_SECONDS = 300;
const s3 = new S3Client({ region: "ap-southeast-2" });

const MOMENT_DURATION_HOURS = 24;

function imageReferenceToKey(ref) {
    if (!ref || typeof ref !== "string") return null;
    if (!/^https?:\/\//i.test(ref)) return ref.replace(/^\/+/, "");
    try {
        const url = new URL(ref);
        if (!url.hostname.includes(".s3.")) return null; // not our bucket
        return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
        return null;
    }
}

async function withSignedImage(moment) {
    const key = imageReferenceToKey(moment.imageUrl);
    if (!key) return moment;
    try {
        const imageUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }),
            { expiresIn: MEDIA_URL_EXPIRY_SECONDS }
        );
        return { ...moment, imageUrl };
    } catch (error) {
        console.error("Could not sign moment image:", key, error);
        return moment;
    }
}

// --------------------------------------------------
// RESPONSE HELPER
// --------------------------------------------------

function response(statusCode, body) {

    return {
        statusCode,

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify(body)
    };
}


// --------------------------------------------------
// AUTHENTICATION HELPER
// --------------------------------------------------

function requireAuthenticatedUser(event) {

    const claims =
        event.requestContext
            ?.authorizer
            ?.jwt
            ?.claims;


    if (!claims?.sub) {

        return {
            error: response(401, {
                message: "Unauthorised - Please log in"
            })
        };
    }


    let groups = [];

    const rawGroups =
        claims["cognito:groups"];


    if (Array.isArray(rawGroups)) {

        groups = rawGroups;

    } else if (typeof rawGroups === "string") {

        groups = rawGroups
            .replace(/^\[/, "")
            .replace(/\]$/, "")
            .split(",")
            .map(group =>
                group
                    .trim()
                    .replace(/^["']|["']$/g, "")
            )
            .filter(Boolean);
    }


    return {
        user: {
            id: claims.sub,

            username:
                claims.username ??
                claims["cognito:username"] ??
                claims.email,

            email:
                claims.email,

            groups         
        }
    };
    console.log("Parsed groups:", groups);
}


// --------------------------------------------------
// JSON BODY HELPER
// --------------------------------------------------

function parseBody(event) {

    try {

        return {
            body:
                JSON.parse(
                    event.body || "{}"
                )
        };

    } catch {

        return {
            error: response(400, {
                message: "Invalid JSON body"
            })
        };
    }
}


// --------------------------------------------------
// MOMENT EXPIRY
// --------------------------------------------------

function calculateExpiresAt(
    createdAt
) {

    const createdAtMs =
        new Date(createdAt)
            .getTime();


    return new Date(
        createdAtMs +
        MOMENT_DURATION_HOURS *
        60 *
        60 *
        1000
    ).toISOString();
}


// --------------------------------------------------
// ARCHIVE MOMENT IF EXPIRED
// --------------------------------------------------

async function ensureMomentLifecycle(
    moment
) {

    if (
        !moment ||
        moment.status !== "active"
    ) {

        return moment;
    }


    const expiresAt =
        new Date(
            moment.expiresAt
        ).getTime();


    if (
        Number.isNaN(expiresAt) ||
        expiresAt > Date.now()
    ) {

        return moment;
    }


    const now =
        new Date().toISOString();


    const result =
        await dynamodb.send(
            new UpdateCommand({
                TableName:
                    MOMENTS_TABLE,

                Key: {
                    id:
                        moment.id
                },

                UpdateExpression:
                    "SET #status = :archived, archivedAt = :archivedAt, updatedAt = :updatedAt",

                ExpressionAttributeNames: {
                    "#status":
                        "status"
                },

                ExpressionAttributeValues: {
                    ":archived":
                        "archived",

                    ":archivedAt":
                        now,

                    ":updatedAt":
                        now
                },

                ReturnValues:
                    "ALL_NEW"
            })
        );


    return result.Attributes;
}


// --------------------------------------------------
// GET FOLLOWING USER IDs
// --------------------------------------------------

async function getFollowingIds(
    userId
) {

    const result =
        await dynamodb.send(
            new ScanCommand({
                TableName:
                    FOLLOWS_TABLE,

                FilterExpression:
                    "followerId = :userId",

                ExpressionAttributeValues: {
                    ":userId":
                        userId
                }
            })
        );


    return (
        result.Items || []
    ).map(
        follow =>
            follow.followeeId
    );
}


// --------------------------------------------------
// CREATE MOMENT
// POST /v1/moments
// --------------------------------------------------

async function createMoment(
    event
) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {

        return auth.error;
    }


    const user =
        auth.user;


    const parsed =
        parseBody(event);


    if (parsed.error) {

        return parsed.error;
    }


    const {
        imageUrl,
        caption = ""
    } = parsed.body;


    if (
        !imageUrl ||
        typeof imageUrl !== "string"
    ) {

        return response(400, {
            message:
                "imageUrl is required"
        });
    }


    if (
        typeof caption !== "string"
    ) {

        return response(400, {
            message:
                "caption must be a string"
        });
    }


    if (
        caption.length > 500
    ) {

        return response(400, {
            message:
                "caption must be 500 characters or less"
        });
    }


    const now =
        new Date().toISOString();


    const moment = {
        id:
            crypto.randomUUID(),

        userId:
            user.id,

        imageUrl,

        caption,

        status:
            "active",

        createdAt:
            now,

        expiresAt:
            calculateExpiresAt(
                now
            ),

        updatedAt:
            now
    };


    try {

        await dynamodb.send(
            new PutCommand({
                TableName:
                    MOMENTS_TABLE,

                Item:
                    moment,

                ConditionExpression:
                    "attribute_not_exists(id)"
            })
        );


        console.log(
            "Moment created:",
            moment.id,
            "by user:",
            user.id
        );


        return response(201, {
            message:
                "Created successfully",

            moment
        });


    } catch (error) {

        console.error(
            "Create moment error:",
            error
        );


        return response(500, {
            message:
                "An unexpected error occurred"
        });
    }
}


// --------------------------------------------------
// MOMENT FEED
// GET /v1/moments/feed
// --------------------------------------------------

async function getMomentFeed(
    event
) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {

        return auth.error;
    }


    const user =
        auth.user;


    try {

        const followingIds =
            await getFollowingIds(
                user.id
            );


        const sourceUserIds =
            new Set([
                user.id,
                ...followingIds
            ]);


        /*
         * For the small assessment dataset a Scan
         * is acceptable.
         *
         * A production DynamoDB design would use
         * an index supporting userId queries.
         */

        const result =
            await dynamodb.send(
                new ScanCommand({
                    TableName:
                        MOMENTS_TABLE
                })
            );


        const moments = [];


        for (
            const moment of
            result.Items || []
        ) {

            if (
                !sourceUserIds.has(
                    moment.userId
                )
            ) {

                continue;
            }


            const updated =
                await ensureMomentLifecycle(
                    moment
                );


            if (
                updated.status !==
                "active"
            ) {

                continue;
            }


            /*
             * Hidden moments are not included
             * in an ordinary feed.
             */

            if (
                updated.status ===
                "hidden"
            ) {

                continue;
            }


            moments.push(await withSignedImage(updated));
        }


        moments.sort(
            (a, b) =>
                new Date(
                    b.createdAt
                ).getTime() -
                new Date(
                    a.createdAt
                ).getTime()
        );


        return response(200, {
            message:
                "Success",

            moments
        });


    } catch (error) {

        console.error(
            "Get moment feed error:",
            error
        );


        return response(500, {
            message:
                "An unexpected error occurred"
        });
    }
}


// --------------------------------------------------
// MOMENT ARCHIVE
// GET /v1/moments/archive
// --------------------------------------------------

async function getMomentArchive(
    event
) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {

        return auth.error;
    }


    const user =
        auth.user;


    try {

        const followingIds =
            await getFollowingIds(
                user.id
            );


        const sourceUserIds =
            new Set([
                user.id,
                ...followingIds
            ]);


        const result =
            await dynamodb.send(
                new ScanCommand({
                    TableName:
                        MOMENTS_TABLE
                })
            );


        const moments = [];


        for (
            const moment of
            result.Items || []
        ) {

            if (
                !sourceUserIds.has(
                    moment.userId
                )
            ) {

                continue;
            }


            const updated =
                await ensureMomentLifecycle(
                    moment
                );


            if (
                updated.status !==
                "archived"
            ) {

                continue;
            }


            moments.push(await withSignedImage(updated));
        }


        moments.sort(
            (a, b) =>
                new Date(
                    b.createdAt
                ).getTime() -
                new Date(
                    a.createdAt
                ).getTime()
        );


        return response(200, {
            message:
                "Success",

            moments
        });


    } catch (error) {

        console.error(
            "Get moment archive error:",
            error
        );


        return response(500, {
            message:
                "An unexpected error occurred"
        });
    }
}


// --------------------------------------------------
// HIDE MOMENT
// POST /v1/moments/{id}/hide
// MODERATOR ONLY
// --------------------------------------------------

async function hideMoment(
    event
) {

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

        console.log(
            "Non-moderator attempted to hide moment:",
            user.id
        );


        return response(403, {
            message:
                "Only moderators can hide moments"
        });
    }


    const momentId =
        event.pathParameters?.id;


    if (!momentId) {

        return response(400, {
            message:
                "Moment ID is required"
        });
    }


    try {

        const existing =
            await dynamodb.send(
                new GetCommand({
                    TableName:
                        MOMENTS_TABLE,

                    Key: {
                        id:
                            momentId
                    }
                })
            );


        if (
            !existing.Item
        ) {

            return response(404, {
                message:
                    "Moment not found"
            });
        }


        const now =
            new Date().toISOString();


        const result =
            await dynamodb.send(
                new UpdateCommand({
                    TableName:
                        MOMENTS_TABLE,

                    Key: {
                        id:
                            momentId
                    },

                    UpdateExpression:
                        "SET #status = :hidden, hiddenBy = :hiddenBy, hiddenAt = :hiddenAt, updatedAt = :updatedAt",

                    ExpressionAttributeNames: {
                        "#status":
                            "status"
                    },

                    ExpressionAttributeValues: {
                        ":hidden":
                            "hidden",

                        ":hiddenBy":
                            user.id,

                        ":hiddenAt":
                            now,

                        ":updatedAt":
                            now
                    },

                    ReturnValues:
                        "ALL_NEW"
                })
            );


        console.log(
            "Moment hidden:",
            momentId,
            "by moderator:",
            user.id
        );


        return response(200, {
            message:
                "Updated successfully",

            moment:
                result.Attributes
        });


    } catch (error) {

        console.error(
            "Hide moment error:",
            error
        );


        return response(500, {
            message:
                "An unexpected error occurred"
        });
    }
}


// --------------------------------------------------
// DELETE MOMENT
// DELETE /v1/moments/{id}
// OWNER OR MODERATOR
// --------------------------------------------------

async function deleteMoment(
    event
) {

    const auth =
        requireAuthenticatedUser(
            event
        );


    if (auth.error) {

        return auth.error;
    }


    const user =
        auth.user;


    const momentId =
        event.pathParameters?.id;


    if (!momentId) {

        return response(400, {
            message:
                "Moment ID is required"
        });
    }


    try {

        const existing =
            await dynamodb.send(
                new GetCommand({
                    TableName:
                        MOMENTS_TABLE,

                    Key: {
                        id:
                            momentId
                    }
                })
            );


        if (
            !existing.Item
        ) {

            return response(404, {
                message:
                    "Moment not found"
            });
        }


        const isOwner =
            existing.Item.userId ===
            user.id;


        const isModerator =
            user.groups.includes(
                "moderator"
            );


        if (
            !isOwner &&
            !isModerator
        ) {

            return response(403, {
                message:
                    "You do not have permission to delete this moment"
            });
        }


        await dynamodb.send(
            new DeleteCommand({
                TableName:
                    MOMENTS_TABLE,

                Key: {
                    id:
                        momentId
                }
            })
        );


        console.log(
            "Moment deleted:",
            momentId,
            "by user:",
            user.id
        );


        return response(200, {
            message:
                "Deleted successfully"
        });


    } catch (error) {

        console.error(
            "Delete moment error:",
            error
        );


        return response(500, {
            message:
                "An unexpected error occurred"
        });
    }
}


// --------------------------------------------------
// MAIN HANDLER
// --------------------------------------------------

export const handler =
async (event) => {

    console.log(
        "========================================"
    );

    console.log(
        "Moment Lambda invoked"
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


    // CREATE MOMENT

    if (
        event.routeKey ===
        "POST /v1/moments"
    ) {

        return await createMoment(
            event
        );
    }


    // MOMENT FEED

    if (
        event.routeKey ===
        "GET /v1/moments/feed"
    ) {

        return await getMomentFeed(
            event
        );
    }


    // MOMENT ARCHIVE

    if (
        event.routeKey ===
        "GET /v1/moments/archive"
    ) {

        return await getMomentArchive(
            event
        );
    }


    // HIDE MOMENT

    if (
        event.routeKey ===
        "POST /v1/moments/{id}/hide"
    ) {

        return await hideMoment(
            event
        );
    }


    // DELETE MOMENT

    if (
        event.routeKey ===
        "DELETE /v1/moments/{id}"
    ) {

        return await deleteMoment(
            event
        );
    }


    return response(404, {
        message:
            "Route not found"
    });
};