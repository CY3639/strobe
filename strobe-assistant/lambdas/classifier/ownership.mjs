import {
    ScanCommand
} from "@aws-sdk/lib-dynamodb";

import {
    dynamodb
} from "../../src/shared/aws.mjs";


function decodeKey(
    value
) {

    return decodeURIComponent(
        String(value)
            .replace(/\+/g, " ")
    );
}


/**
 * Preferred final approach.
 *
 * Example only:
 *
 * uploads/<userId>/<postId>/<fileId>
 *
 * BUT DO NOT configure this mode until Step 0 proves that this
 * really is your A1 key convention.
 *
 * The regex must use named capture groups:
 *
 * (?<userId>...)
 * (?<postId>...)
 */
function ownershipFromRegex({
    imageKey,
    regexText
}) {

    if (!regexText) {

        throw new Error(
            "ownership-mode is key-regex but upload-key-regex is missing."
        );
    }


    const regex =
        new RegExp(regexText);


    const match =
        imageKey.match(regex);


    if (
        !match
        ||
        !match.groups?.userId
        ||
        !match.groups?.postId
    ) {

        throw new Error(
            `Could not extract userId/postId from key: ${imageKey}`
        );
    }


    return {
        userId:
            match.groups.userId,

        postId:
            match.groups.postId
    };
}


/**
 * Temporary fallback only.
 *
 * It scans A1 posts looking for the image key in the `images`
 * structure.
 *
 * This exists so the prototype can be proven before changing A1.
 * It is NOT the scalable final architecture.
 */
async function ownershipFromPostScan({
    imageKey,
    postsTable
}) {

    const decodedKey =
        decodeKey(imageKey);


    let lastEvaluatedKey;


    do {

        const response =
            await dynamodb.send(
                new ScanCommand({
                    TableName:
                        postsTable,

                    ProjectionExpression:
                        "id, userId, images",

                    ExclusiveStartKey:
                        lastEvaluatedKey
                })
            );


        for (
            const item
            of
            response.Items ?? []
        ) {

            const serialized =
                JSON.stringify(
                    item.images ?? []
                );


            if (
                serialized.includes(decodedKey)
                ||
                serialized.includes(
                    encodeURIComponent(decodedKey)
                )
            ) {

                return {
                    userId:
                        item.userId,

                    postId:
                        item.id
                };
            }
        }


        lastEvaluatedKey =
            response.LastEvaluatedKey;

    } while (lastEvaluatedKey);


    throw new Error(
        `Could not find a post referencing S3 key: ${decodedKey}`
    );
}


export async function resolveImageOwnership({
    imageKey,
    config
}) {

    if (
        config.ownershipMode
        ===
        "key-regex"
    ) {

        return ownershipFromRegex({
            imageKey,

            regexText:
                config.uploadKeyRegex
        });
    }


    if (
        config.ownershipMode
        ===
        "post-scan"
    ) {

        return ownershipFromPostScan({
            imageKey,

            postsTable:
                config.postsTable
        });
    }


    throw new Error(
        `Unsupported ownership mode: ${config.ownershipMode}`
    );
}