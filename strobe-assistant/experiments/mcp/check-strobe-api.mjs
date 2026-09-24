import "dotenv/config";

import {
    StrobeClient
} from "./strobe-client.mjs";


async function main() {

    const baseUrl =
        process.env.STROBE_BASE_URL?.trim();

    const bearerToken =
        process.env.STROBE_BEARER_TOKEN?.trim();

    const postId =
        process.env.STROBE_TEST_POST_ID?.trim();


    const missing = [];


    if (!baseUrl) {
        missing.push(
            "STROBE_BASE_URL"
        );
    }


    if (!bearerToken) {
        missing.push(
            "STROBE_BEARER_TOKEN"
        );
    }


    if (!postId) {
        missing.push(
            "STROBE_TEST_POST_ID"
        );
    }


    if (missing.length > 0) {

        throw new Error(
            `Missing required environment variables: ${
                missing.join(", ")
            }`
        );
    }


    const client =
        new StrobeClient({
            baseUrl,
            bearerToken
        });


    const post =
        await client.getPost(
            postId
        );


    console.log(
        JSON.stringify(
            post,
            null,
            2
        )
    );
}


main().catch(
    error => {

        console.error(
            error
        );

        process.exit(1);
    }
);