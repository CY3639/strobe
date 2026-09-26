import {
    generateText,
    embedText
} from "../src/bedrock.mjs";


const [
    ,
    ,
    textModelId,
    embeddingModelId
] = process.argv;


if (
    !textModelId
    ||
    !embeddingModelId
) {

    console.error(
        "Usage:"
    );

    console.error(
        "node scripts/smoke-bedrock.mjs <text-model-id> <embedding-model-id>"
    );

    process.exit(1);
}


console.log(
    "1. Testing Bedrock text generation..."
);


const text =
    await generateText({
        modelId:
            textModelId,

        prompt:
            "Reply with exactly: bedrock-ok",

        maxTokens:
            20,

        temperature:
            0
    });


console.log(
    `Text response: ${text}`
);


console.log(
    "\n2. Testing Titan embeddings..."
);


const embedding =
    await embedText({
        modelId:
            embeddingModelId,

        text:
            "a black dog running on a beach"
    });


console.log(
    `Embedding dimension: ${embedding.length}`
);


if (
    embedding.length !== 256
) {

    throw new Error(
        "Embedding smoke test failed."
    );
}


console.log(
    "\nBedrock smoke tests passed."
);