import {
    GetObjectCommand
} from "@aws-sdk/client-s3";

import {
    s3
} from "./aws.mjs";

import { 
    PermanentError 
} from "./errors.mjs";


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


/*
 * Trust the file's bytes, not its Content-Type header.
 * Strobe uploads are signed as application/octet-stream,
 * so the header usually says nothing useful.
 */
export function detectImageFormat(bytes) {
    const ascii = (start, end) =>
        String.fromCharCode(...bytes.slice(start, end));

    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "jpeg";
    if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
    if (ascii(0, 4) === "GIF8") return "gif";
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";

    throw new PermanentError("File is not a JPEG, PNG, GIF or WebP image.");
}