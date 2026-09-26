import {
    GetObjectCommand
} from "@aws-sdk/client-s3";

import {
    s3
} from "./aws.mjs";


export async function getS3ObjectBytes({
    bucket,
    key
}) {

    const response =
        await s3.send(
            new GetObjectCommand({
                Bucket:
                    bucket,

                Key:
                    key
            })
        );


    if (!response.Body) {

        throw new Error(
            `S3 returned no body for ${bucket}/${key}`
        );
    }


    return {
        bytes:
            new Uint8Array(
                await response.Body.transformToByteArray()
            ),

        contentType:
            response.ContentType
            ??
            "application/octet-stream",

        etag:
            response.ETag
            ??
            null
    };
}


export function imageFormatFromContentType(
    contentType
) {

    switch (
        contentType
            .split(";")[0]
            .trim()
            .toLowerCase()
    ) {

        case "image/png":
            return "png";

        case "image/gif":
            return "gif";

        case "image/webp":
            return "webp";

        case "image/jpeg":
        case "image/jpg":
            return "jpeg";

        default:
            throw new Error(
                `Unsupported image Content-Type: ${contentType}`
            );
    }
}