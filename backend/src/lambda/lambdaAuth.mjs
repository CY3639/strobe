import {
    CognitoIdentityProviderClient,
    SignUpCommand,
    InitiateAuthCommand,
    AdminDeleteUserCommand
} from "@aws-sdk/client-cognito-identity-provider";

import {
    DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand
} from "@aws-sdk/lib-dynamodb";

import {
    createHmac
} from "crypto";


const REGION = "ap-southeast-2";


// AWS CLIENTS

const cognito = new CognitoIdentityProviderClient({
    region: REGION
});

const dynamodb = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        region: REGION
    })
);


// ENVIRONMENT VARIABLES

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE;


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


// COGNITO SECRET HASH

function calculateSecretHash(username) {
    return createHmac("sha256", CLIENT_SECRET)
        .update(username + CLIENT_ID)
        .digest("base64");
}



// REGISTER
// POST /v1/auth/register

async function register(event) {

    let body;

    try {
        body = JSON.parse(event.body || "{}");
    } catch {
        return response(400, {
            message: "Invalid JSON body"
        });
    }


    /*
     * Strobe normally sends "email".
     * Accept "username" as well for compatibility.
     *
     * In this application, the Cognito username is the email address.
     */
    const username =
        body.email?.trim().toLowerCase() ||
        body.username?.trim().toLowerCase();

    const email =
        body.email?.trim().toLowerCase() ||
        body.username?.trim().toLowerCase();

    const password = body.password;


    if (!username || !password) {
        return response(400, {
            message: "Username and password are required"
        });
    }


    const secretHash = calculateSecretHash(username);


    console.log("Registering user:", username);


    let cognitoUserCreated = false;


    try {

        // 1. CREATE USER IN COGNITO

        const signUpResult = await cognito.send(
            new SignUpCommand({
                ClientId: CLIENT_ID,

                Username: username,

                Password: password,

                SecretHash: secretHash,

                UserAttributes: [
                    {
                        Name: "email",
                        Value: email
                    }
                ]
            })
        );


        cognitoUserCreated = true;


        const userId = signUpResult.UserSub;

        const now = new Date().toISOString();


        console.log("Cognito user created:", userId);


        // 2. CREATE APP USER IN DYNAMODB

        const user = {
            id: userId,
            username: username,
            email: email,
            role: "user",
            createdAt: now,
            updatedAt: now
        };


        await dynamodb.send(
            new PutCommand({
                TableName: USERS_TABLE,

                Item: user,

                ConditionExpression: "attribute_not_exists(id)"
            })
        );


        console.log("DynamoDB user created:", userId);


        // 3. RETURN SUCCESS

        return response(201, user);


    } catch (error) {

        console.error("Registration error:", error);


        // DUPLICATE COGNITO USER

        if (error.name === "UsernameExistsException") {
            return response(409, {
                message: "An account with this email already exists"
            });
        }


        // INVALID PASSWORD / COGNITO VALIDATION

        if (
            error.name === "InvalidPasswordException" ||
            error.name === "InvalidParameterException"
        ) {
            return response(400, {
                message: "Unable to register account with the provided details"
            });
        }


        /*
         * If Cognito succeeded but DynamoDB failed, remove the
         * Cognito identity so registration does not leave the
         * system in a half-created state.
         */
        if (cognitoUserCreated) {

            try {

                console.log(
                    "DynamoDB registration failed. Rolling back Cognito user:",
                    username
                );


                await cognito.send(
                    new AdminDeleteUserCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: username
                    })
                );


                console.log("Cognito rollback completed");

            } catch (rollbackError) {

                console.error(
                    "Failed to rollback Cognito user:",
                    rollbackError
                );
            }
        }


        return response(500, {
            message: "Internal server error"
        });
    }
}

// Read claims from a token we just received directly from Cognito
function decodeJwtPayload(jwt) {
    const payload = jwt.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}


// LOGIN
// POST /v1/auth/login

async function login(event) {

    let body;

    try {
        body = JSON.parse(event.body || "{}");
    } catch {
        return response(400, {
            message: "Invalid JSON body"
        });
    }


    /*
     * Gradescope sends:
     *
     * {
     *   "username": "user@example.com",
     *   "password": "..."
     * }
     *
     * Insomnia may send:
     *
     * {
     *   "email": "user@example.com",
     *   "password": "..."
     * }
     *
     * Support both.
     */
    const username =
        body.username?.trim().toLowerCase() ||
        body.email?.trim().toLowerCase();

    const password = body.password;


    if (!username || !password) {
        return response(400, {
            message: "Username and password are required"
        });
    }


    const secretHash = calculateSecretHash(username);


    console.log("Login attempt:", username);


    try {

        // AUTHENTICATE THROUGH COGNITO

        const authResult = await cognito.send(
            new InitiateAuthCommand({

                AuthFlow: "USER_PASSWORD_AUTH",

                ClientId: CLIENT_ID,

                AuthParameters: {
                    USERNAME: username,
                    PASSWORD: password,
                    SECRET_HASH: secretHash
                }
            })
        );


        const auth = authResult.AuthenticationResult;


        if (!auth) {

            console.error(
                "Cognito authentication completed without AuthenticationResult"
            );

            return response(401, {
                message: "Invalid username or password"
            });
        }


        console.log("Login successful:", username);


        // RETURN COGNITO TOKENS

        // return response(200, {
            
        //     token: auth.AccessToken,

        //     accessToken: auth.AccessToken,

        //     idToken: auth.IdToken,

        //     refreshToken: auth.RefreshToken,

        //     expiresIn: auth.ExpiresIn,

        //     tokenType: auth.TokenType
        // });

        const claims = decodeJwtPayload(auth.IdToken);

        // Users table is keyed by Cognito sub (see register())
        const userResult = await dynamodb.send(
            new GetCommand({
                TableName: USERS_TABLE,
                Key: { id: claims.sub }
            })
        );

        const user = userResult.Item ?? {
            id: claims.sub,
            username: claims.email,
            email: claims.email,
            role: "user"
        };

        return response(200, {
            user,
            token: auth.AccessToken,
            accessToken: auth.AccessToken,
            idToken: auth.IdToken,
            refreshToken: auth.RefreshToken,
            expiresIn: auth.ExpiresIn,
            tokenType: auth.TokenType
        });


    } catch (error) {

        console.error(
            "Login error:",
            error.name,
            error.message
        );


        /*
         * Do not distinguish between:
         *
         * - user does not exist
         * - password is wrong
         *
         * This prevents account enumeration.
         */
        if (
            error.name === "NotAuthorizedException" ||
            error.name === "UserNotFoundException"
        ) {

            return response(401, {
                message: "Invalid username or password"
            });
        }


        // User exists but has not been confirmed

        if (error.name === "UserNotConfirmedException") {

            return response(401, {
                message: "Account is not confirmed"
            });
        }


        return response(500, {
            message: "Internal server error"
        });
    }
}



// MAIN LAMBDA HANDLER

export const handler = async (event) => {

    console.log("========================================");
    console.log("Auth Lambda invoked");
    console.log("Route:", event.routeKey);
    console.log(
        "Method:",
        event.requestContext?.http?.method
    );
    console.log("========================================");


    // REGISTER

    if (event.routeKey === "POST /v1/auth/register") {
        return await register(event);
    }


    // LOGIN

    if (event.routeKey === "POST /v1/auth/login") {
        return await login(event);
    }


    // UNKNOWN AUTH ROUTE

    return response(404, {
        message: "Route not found"
    });
};