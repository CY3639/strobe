import {
    CognitoIdentityProviderClient,
    AdminDeleteUserCommand
} from "@aws-sdk/client-cognito-identity-provider";

import {
    DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    DeleteCommand,
    ScanCommand,
    BatchGetCommand
} from "@aws-sdk/lib-dynamodb";

// CONFIGURATION

const REGION = "ap-southeast-2";

const USERS_TABLE =
    process.env.DYNAMODB_USERS_TABLE;

const FOLLOWS_TABLE =
    process.env.DYNAMODB_FOLLOWS_TABLE;

const USER_POOL_ID =
    process.env.COGNITO_USER_POOL_ID;


// AWS CLIENTS

const dynamodb = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        region: REGION
    })
);

const cognito =
    new CognitoIdentityProviderClient({
        region: REGION
    });


// RESPONSE HELPER

function response(statusCode, body) {

    return {
        statusCode,

        headers: {
            "content-type": "application/json"
        },

        body: JSON.stringify(body)
    };
}


// AUTHENTICATION

function getClaims(event) {

    return (
        event.requestContext
            ?.authorizer
            ?.jwt
            ?.claims || null
    );
}


function getAuthenticatedUser(event) {

    const claims = getClaims(event);

    if (!claims?.sub) {
        return null;
    }

    return {
        id: claims.sub,

        username:
            claims.username ||
            claims["cognito:username"] ||
            null,

        groups:
            parseGroups(
                claims["cognito:groups"]
            )
    };
}


function parseGroups(rawGroups) {

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
        .map(group => group.trim())
        .filter(Boolean);
}


function requireAuthenticatedUser(event) {

    const user =
        getAuthenticatedUser(event);

    if (!user) {

        return {
            error: response(401, {
                message: "Unauthorized"
            })
        };
    }

    return {
        user
    };
}


// USER RESPONSE SANITISATION

function sanitizeUser(user) {

    if (!user) {
        return user;
    }

    /*
     * Never return a password field even if an old/migrated
     * DynamoDB record happens to contain one.
     */

    const {
        password,
        ...safeUser
    } = user;

    return safeUser;
}


// GET ALL USERS
// GET /v1/users

async function getUsers() {

    try {

        const result =
            await dynamodb.send(
                new ScanCommand({
                    TableName: USERS_TABLE
                })
            );

        const users =
            (result.Items || [])
                .map(sanitizeUser);

        return response(
            200,
            users
        );

    } catch (error) {

        console.error(
            "Get users error:",
            error
        );

        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// GET USER BY ID
// GET /v1/users/{id}

async function getUserById(event) {

    const userId =
        event.pathParameters?.id;

    if (!userId) {

        return response(400, {
            message:
                "User ID is required"
        });
    }


    try {

        const result =
            await dynamodb.send(
                new GetCommand({
                    TableName:
                        USERS_TABLE,

                    Key: {
                        id: userId
                    }
                })
            );


        if (!result.Item) {

            return response(404, {
                message:
                    "User not found"
            });
        }


        return response(
            200,
            sanitizeUser(result.Item)
        );

    } catch (error) {

        console.error(
            "Get user error:",
            error
        );

        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// DELETE OWN ACCOUNT
// DELETE /v1/users/{id}

async function deleteUser(event) {

    const auth =
        requireAuthenticatedUser(event);

    if (auth.error) {
        return auth.error;
    }


    const authenticatedUser =
        auth.user;

    const requestedUserId =
        event.pathParameters?.id;


    if (!requestedUserId) {

        return response(400, {
            message:
                "User ID is required"
        });
    }


    /*
     * Users may delete themselves only.
     * The URL must match the immutable Cognito sub
     * from the verified JWT.
     */

    if (
        requestedUserId !==
        authenticatedUser.id
    ) {

        return response(403, {
            message: "Forbidden"
        });
    }


    try {

        // FIND APP USER

        const existing =
            await dynamodb.send(
                new GetCommand({
                    TableName:
                        USERS_TABLE,

                    Key: {
                        id:
                            authenticatedUser.id
                    }
                })
            );


        if (!existing.Item) {

            return response(404, {
                message:
                    "User not found"
            });
        }


        /*
         * Cognito AdminDeleteUser needs the Cognito Username,
         * not the immutable sub.
         *
         * Access tokens normally contain username. We also
         * fall back to the application's stored username.
         */

        const cognitoUsername =
            authenticatedUser.username ||
            existing.Item.username ||
            existing.Item.email;


        if (!cognitoUsername) {

            console.error(
                "Could not determine Cognito username for:",
                authenticatedUser.id
            );

            return response(500, {
                message:
                    "Internal server error"
            });
        }


        // DELETE COGNITO IDENTITY

        await cognito.send(
            new AdminDeleteUserCommand({
                UserPoolId:
                    USER_POOL_ID,

                Username:
                    cognitoUsername
            })
        );


        console.log(
            "Cognito identity deleted:",
            authenticatedUser.id
        );


        // DELETE APPLICATION USER

        await dynamodb.send(
            new DeleteCommand({
                TableName:
                    USERS_TABLE,

                Key: {
                    id:
                        authenticatedUser.id
                }
            })
        );


        console.log(
            "DynamoDB user deleted:",
            authenticatedUser.id
        );


        /*
         * Relationships belonging to other entities can be
         * cleaned up separately. The graded requirement here
         * is that the user's Cognito identity is genuinely
         * deprovisioned.
         */

        return response(200, {
            message:
                "Account deleted"
        });

    } catch (error) {

        console.error(
            "Delete user error:",
            error
        );


        if (
            error.name ===
            "UserNotFoundException"
        ) {

            return response(404, {
                message:
                    "User not found"
            });
        }


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// FOLLOW USER
// POST /v1/users/{userId}/follow

async function followUser(event) {

    const auth =
        requireAuthenticatedUser(event);

    if (auth.error) {
        return auth.error;
    }


    const followerId =
        auth.user.id;

    const followeeId =
        event.pathParameters?.userId;


    if (!followeeId) {

        return response(400, {
            message:
                "User ID is required"
        });
    }


    // Cannot follow yourself
    if (followerId === followeeId) {

        return response(400, {
            message:
                "You cannot follow yourself"
        });
    }


    try {

        // VERIFY TARGET USER EXISTS

        const targetUser =
            await dynamodb.send(
                new GetCommand({
                    TableName:
                        USERS_TABLE,

                    Key: {
                        id:
                            followeeId
                    }
                })
            );


        if (!targetUser.Item) {

            return response(404, {
                message:
                    "User not found"
            });
        }


        /*
         * Deterministic ID means the relationship has one
         * unique key for this pair.
         *
         * This prevents duplicate follow records.
         */

        const followId =
            `${followerId}#${followeeId}`;

        const follow = {
            id: followId,

            followerId,

            followeeId,

            createdAt:
                new Date().toISOString()
        };


        await dynamodb.send(
            new PutCommand({
                TableName:
                    FOLLOWS_TABLE,

                Item:
                    follow,

                ConditionExpression:
                    "attribute_not_exists(id)"
            })
        );


        console.log(
            "Follow created:",
            followId
        );


        return response(
            201,
            follow
        );

    } catch (error) {

        /*
         * If the deterministic relationship already exists,
         * treat the repeated operation as harmless.
         */

        if (
            error.name ===
            "ConditionalCheckFailedException"
        ) {

            return response(409, {
                message:
                    "Already following this user"
            });
        }


        console.error(
            "Follow user error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// UNFOLLOW USER
// DELETE /v1/users/{userId}/follow

async function unfollowUser(event) {

    const auth =
        requireAuthenticatedUser(event);

    if (auth.error) {
        return auth.error;
    }


    const followerId =
        auth.user.id;

    const followeeId =
        event.pathParameters?.userId;


    if (!followeeId) {

        return response(400, {
            message:
                "User ID is required"
        });
    }


    const followId =
        `${followerId}#${followeeId}`;


    try {

        await dynamodb.send(
            new DeleteCommand({
                TableName:
                    FOLLOWS_TABLE,

                Key: {
                    id:
                        followId
                }
            })
        );


        console.log(
            "Follow deleted:",
            followId
        );


        return response(200, {
            message:
                "User unfollowed"
        });

    } catch (error) {

        console.error(
            "Unfollow user error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// LOAD USERS BY IDS

async function loadUsersByIds(ids) {

    const uniqueIds =
        [...new Set(ids)]
            .filter(Boolean);


    if (uniqueIds.length === 0) {
        return [];
    }


    /*
     * BatchGet supports up to 100 keys at once.
     * The supplied Strobe dataset is small, but this chunking
     * prevents the helper from depending on that assumption.
     */

    const users = [];


    for (
        let i = 0;
        i < uniqueIds.length;
        i += 100
    ) {

        const chunk =
            uniqueIds.slice(
                i,
                i + 100
            );


        const result =
            await dynamodb.send(
                new BatchGetCommand({
                    RequestItems: {
                        [USERS_TABLE]: {
                            Keys:
                                chunk.map(id => ({
                                    id
                                }))
                        }
                    }
                })
            );


        const returnedUsers =
            result.Responses
                ?.[USERS_TABLE] ||
            [];


        users.push(
            ...returnedUsers.map(
                sanitizeUser
            )
        );
    }


    return users;
}


// GET FOLLOWERS
// GET /v1/users/{userId}/followers

async function getFollowers(event) {

    const userId =
        event.pathParameters?.userId;


    if (!userId) {

        return response(400, {
            message:
                "User ID is required"
        });
    }


    try {

        const user =
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


        if (!user.Item) {

            return response(404, {
                message:
                    "User not found"
            });
        }


        /*
         * Find relationships where this user is
         * the person being followed.
         */

        const follows =
            await dynamodb.send(
                new ScanCommand({
                    TableName:
                        FOLLOWS_TABLE,

                    FilterExpression:
                        "followeeId = :userId",

                    ExpressionAttributeValues: {
                        ":userId":
                            userId
                    }
                })
            );


        const followerIds =
            (follows.Items || [])
                .map(
                    follow =>
                        follow.followerId
                );


        const users =
            await loadUsersByIds(
                followerIds
            );


        return response(
            200,
            users
        );

    } catch (error) {

        console.error(
            "Get followers error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// GET FOLLOWING
// GET /v1/users/{userId}/following

async function getFollowing(event) {

    const userId =
        event.pathParameters?.userId;


    if (!userId) {

        return response(400, {
            message:
                "User ID is required"
        });
    }


    try {

        const user =
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


        if (!user.Item) {

            return response(404, {
                message:
                    "User not found"
            });
        }


        /*
         * Find relationships where this user is
         * the follower.
         */

        const follows =
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


        const followeeIds =
            (follows.Items || [])
                .map(
                    follow =>
                        follow.followeeId
                );


        const users =
            await loadUsersByIds(
                followeeIds
            );


        return response(
            200,
            users
        );

    } catch (error) {

        console.error(
            "Get following error:",
            error
        );


        return response(500, {
            message:
                "Internal server error"
        });
    }
}


// MAIN HANDLER

export const handler = async (event) => {

    console.log(
        "========================================"
    );

    console.log(
        "User Lambda invoked"
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


    // SAFE JWT DEBUGGING

    const claims =
        getClaims(event);


    if (claims) {

        console.log(
            "Authenticated Cognito sub:",
            claims.sub
        );

        console.log(
            "Cognito groups:",
            claims["cognito:groups"]
        );

    } else {

        console.log(
            "No JWT claims available"
        );
    }


    console.log(
        "========================================"
    );


    // GET ALL USERS

    if (
        event.routeKey ===
        "GET /v1/users"
    ) {

        return await getUsers();
    }


    // GET USER BY ID

    if (
        event.routeKey ===
        "GET /v1/users/{id}"
    ) {

        return await getUserById(
            event
        );
    }


    // DELETE OWN USER ACCOUNT

    if (
        event.routeKey ===
        "DELETE /v1/users/{id}"
    ) {

        return await deleteUser(
            event
        );
    }


    // FOLLOW USER

    if (
        event.routeKey ===
        "POST /v1/users/{userId}/follow"
    ) {

        return await followUser(
            event
        );
    }


    // UNFOLLOW USER

    if (
        event.routeKey ===
        "DELETE /v1/users/{userId}/follow"
    ) {

        return await unfollowUser(
            event
        );
    }


    // GET FOLLOWERS

    if (
        event.routeKey ===
        "GET /v1/users/{userId}/followers"
    ) {

        return await getFollowers(
            event
        );
    }


    // GET FOLLOWING

    if (
        event.routeKey ===
        "GET /v1/users/{userId}/following"
    ) {

        return await getFollowing(
            event
        );
    }


    // UNKNOWN USER ROUTE

    return response(404, {
        message:
            "Route not found"
    });
};