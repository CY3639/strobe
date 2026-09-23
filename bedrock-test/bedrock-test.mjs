import fs from "node:fs";

import {
    BedrockRuntimeClient,
    ConverseCommand,
    InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";


// ============================================================
// Configuration
// ============================================================

const REGION = "ap-southeast-2";

const NEMOTRON_MODEL_ID = "nvidia.nemotron-super-3-120b";
const GEMMA_MODEL_ID = "google.gemma-3-12b-it";
const TITAN_MODEL_ID = "amazon.titan-embed-image-v1";

const TEST_IMAGE_PATH = "./orange-kitty.jpeg";
const EMBEDDING_DIMENSION = 256;


// ============================================================
// Bedrock Runtime client
// ============================================================

const bedrock = new BedrockRuntimeClient({
    region: REGION
});


// ============================================================
// Test 1 — Nemotron text generation
// ============================================================

async function testNemotron() {
    console.log("\n========================================");
    console.log("TEST 1 — Nemotron");
    console.log("========================================");

    const command = new ConverseCommand({
        modelId: NEMOTRON_MODEL_ID,

        messages: [
            {
                role: "user",
                content: [
                    {
                        text: "Reply exactly: bedrock-ok"
                    }
                ]
            }
        ],

        inferenceConfig: {
            maxTokens: 20,
            temperature: 0
        }
    });

    const response = await bedrock.send(command);

    const text = response.output?.message?.content
        ?.filter(block => block.text)
        ?.map(block => block.text)
        ?.join("")
        ?.trim();

    console.log("Model response:", text);

    if (!text) {
        throw new Error(
            "Nemotron test failed: the model returned no text."
        );
    }

    if (text !== "bedrock-ok") {
        console.warn(
            `WARNING: Expected exactly "bedrock-ok", but received "${text}".`
        );
        console.warn(
            "The important part of this test is that Bedrock invocation succeeded."
        );
    }

    console.log("PASS — Nemotron Bedrock invocation works.");
}


// ============================================================
// Test 2 — Gemma vision
// ============================================================

async function testGemma() {
    console.log("\n========================================");
    console.log("TEST 2 — Gemma vision");
    console.log("========================================");

    if (!fs.existsSync(TEST_IMAGE_PATH)) {
        throw new Error(
            `Image not found: ${TEST_IMAGE_PATH}`
        );
    }

    const imageBytes = fs.readFileSync(TEST_IMAGE_PATH);

    const command = new ConverseCommand({
        modelId: GEMMA_MODEL_ID,

        messages: [
            {
                role: "user",
                content: [
                    {
                        text: "Describe this image in one sentence."
                    },
                    {
                        image: {
                            format: "jpeg",
                            source: {
                                bytes: imageBytes
                            }
                        }
                    }
                ]
            }
        ],

        inferenceConfig: {
            maxTokens: 100,
            temperature: 0.2
        }
    });

    const response = await bedrock.send(command);

    const text = response.output?.message?.content
        ?.filter(block => block.text)
        ?.map(block => block.text)
        ?.join("")
        ?.trim();

    console.log("Gemma description:", text);

    if (!text) {
        throw new Error(
            "Gemma test failed: no text description was returned."
        );
    }

    console.log("PASS — Gemma image understanding works.");
}


// ============================================================
// Test 3 — Titan multimodal embedding
// ============================================================

async function testTitan() {
    console.log("\n========================================");
    console.log("TEST 3 — Titan embedding");
    console.log("========================================");

    const inputText = "a black dog at the beach";

    const requestBody = {
        inputText,
        embeddingConfig: {
            outputEmbeddingLength: EMBEDDING_DIMENSION
        }
    };

    const command = new InvokeModelCommand({
        modelId: TITAN_MODEL_ID,

        contentType: "application/json",
        accept: "application/json",

        body: JSON.stringify(requestBody)
    });

    const response = await bedrock.send(command);

    const responseBody = JSON.parse(
        new TextDecoder().decode(response.body)
    );

    const embedding = responseBody.embedding;

    if (!Array.isArray(embedding)) {
        throw new Error(
            "Titan test failed: response did not contain an embedding array."
        );
    }

    console.log("Embedding length:", embedding.length);

    console.log(
        "First 10 values:",
        embedding.slice(0, 10)
    );

    if (embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(
            `Titan test failed: expected ${EMBEDDING_DIMENSION} dimensions, received ${embedding.length}.`
        );
    }

    console.log(
        `PASS — Titan returned a ${EMBEDDING_DIMENSION}-dimensional embedding.`
    );
}


// ============================================================
// Main
// ============================================================

async function main() {
    console.log("Amazon Bedrock test");
    console.log(`Region: ${REGION}`);

    console.log("\nModels:");
    console.log(`Nemotron: ${NEMOTRON_MODEL_ID}`);
    console.log(`Gemma:    ${GEMMA_MODEL_ID}`);
    console.log(`Titan:    ${TITAN_MODEL_ID}`);

    try {
        await testNemotron();
        await testGemma();
        await testTitan();

        console.log("\n========================================");
        console.log("ALL BEDROCK TESTS PASSED");
        console.log("========================================");

        console.log(`
Verified:

Nemotron
    text → text

Gemma
    JPEG + text → description

Titan Multimodal
    text → 256-dimensional vector
`);
    } catch (error) {
        console.error("\n========================================");
        console.error("BEDROCK TEST FAILED");
        console.error("========================================");

        console.error(error);

        process.exit(1);
    }
}


main();