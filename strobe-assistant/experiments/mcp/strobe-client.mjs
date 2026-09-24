export class StrobeApiError extends Error {
    constructor(message) {
        super(message);
        this.name = "StrobeApiError";
    }
}


export class StrobeClient {

    constructor({
        baseUrl,
        bearerToken,
        timeoutMs = 10000
    }) {

        this.baseUrl = baseUrl?.trim().replace(/\/+$/, "");
        this.bearerToken = bearerToken?.trim();
        this.timeoutMs = timeoutMs;

        if (!this.baseUrl) {
            throw new Error(
                "STROBE_BASE_URL is required."
            );
        }

        if (!this.bearerToken) {
            throw new Error(
                "STROBE_BEARER_TOKEN is required."
            );
        }
    }


    async getPost(postId) {

        const validatedPostId =
            this.#validatePostId(postId);

        const encodedPostId =
            encodeURIComponent(validatedPostId);

        const controller =
            new AbortController();

        const timeout =
            setTimeout(
                () => controller.abort(),
                this.timeoutMs
            );

        let response;

        try {

            response = await fetch(
                `${this.baseUrl}/v1/posts/${encodedPostId}`,
                {
                    method: "GET",

                    headers: {
                        Authorization:
                            `Bearer ${this.bearerToken}`,

                        Accept:
                            "application/json"
                    },

                    signal:
                        controller.signal
                }
            );

        } catch (error) {

            if (error.name === "AbortError") {
                throw new StrobeApiError(
                    "Timed out while calling the Strobe API."
                );
            }

            throw new StrobeApiError(
                `Could not reach the Strobe API: ${error.message}`
            );

        } finally {

            clearTimeout(timeout);
        }


        if (response.status === 401) {

            throw new StrobeApiError(
                "Strobe rejected the bearer token with HTTP 401. " +
                "Refresh your Cognito token and try again."
            );
        }


        if (response.status === 403) {

            throw new StrobeApiError(
                "Strobe rejected this request with HTTP 403."
            );
        }


        if (response.status === 404) {

            throw new StrobeApiError(
                `Strobe post '${validatedPostId}' was not found.`
            );
        }


        if (response.status >= 500) {

            throw new StrobeApiError(
                `Strobe backend failed with HTTP ${response.status}.`
            );
        }


        if (!response.ok) {

            const body = await response.text();

            throw new StrobeApiError(
                `Strobe API returned HTTP ${response.status}: ` +
                body.slice(0, 300)
            );
        }


        let payload;

        try {

            payload = await response.json();

        } catch {

            throw new StrobeApiError(
                "Strobe returned a successful response " +
                "that was not valid JSON."
            );
        }


        return this.#normalisePost(payload);
    }


    #validatePostId(postId) {

        if (typeof postId !== "string") {

            throw new Error(
                "post_id must be a string."
            );
        }


        const value = postId.trim();


        if (!value) {

            throw new Error(
                "post_id cannot be empty."
            );
        }


        if (value.length > 128) {

            throw new Error(
                "post_id is too long."
            );
        }


        if (
            value.includes("/") ||
            value.includes("\\")
        ) {

            throw new Error(
                "post_id must contain an ID, not a path."
            );
        }


        return value;
    }


    #normalisePost(payload) {

        if (
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload)
        ) {

            throw new StrobeApiError(
                "Strobe returned an unexpected post response."
            );
        }


        const candidate =
            payload.post ?? payload;


        if (
            !candidate ||
            typeof candidate !== "object" ||
            Array.isArray(candidate)
        ) {

            throw new StrobeApiError(
                "Strobe response does not contain a post object."
            );
        }


        const allowedPostFields = [
            "id",
            "postId",
            "userId",
            "caption",
            "content",
            "text",
            "createdAt",
            "updatedAt",
            "visibility",
            "hidden"
        ];


        const post = {};


        for (const field of allowedPostFields) {

            if (
                Object.prototype.hasOwnProperty.call(
                    candidate,
                    field
                )
            ) {

                post[field] =
                    candidate[field];
            }
        }


        const safeImages = [];


        if (Array.isArray(candidate.images)) {

            for (const image of candidate.images) {

                if (
                    !image ||
                    typeof image !== "object" ||
                    Array.isArray(image)
                ) {
                    continue;
                }


                const safeImage = {};


                for (const field of [
                    "id",
                    "imageId",
                    "key",
                    "contentType"
                ]) {

                    if (
                        Object.prototype.hasOwnProperty.call(
                            image,
                            field
                        )
                    ) {

                        safeImage[field] =
                            image[field];
                    }
                }


                if (
                    Object.keys(safeImage).length > 0
                ) {

                    safeImages.push(
                        safeImage
                    );
                }
            }
        }


        post.images =
            safeImages;

        post.imageCount =
            safeImages.length;


        return {
            source: "strobe-api",
            post
        };
    }
}