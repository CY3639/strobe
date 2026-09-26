/** Embed an image and its caption in Amazon S3 Vectors, then search with text. */

import { readFile } from "node:fs/promises";
import {
  CreateIndexCommand,
  CreateVectorBucketCommand,
  PutVectorsCommand,
  QueryVectorsCommand,
  S3VectorsClient,
} from "@aws-sdk/client-s3vectors";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Replace these example values before running the practical.
const region = "ap-southeast-2";
const vectorBucketName = "n1234567-wk07-vectors";
const indexName = "wk07-demo";
const qutUsername = "n1234567@qut.edu.au";
// Every vector in this index, including the query, must have this length.
const dimension = 256;
// Titan places text and image embeddings in the same vector space.
const titanMultimodalModelId = "amazon.titan-embed-image-v1";
// The vision model from the earlier Bedrock practical generates the caption.
const visionModelId = "google.gemma-3-12b-it";
const textDocument = "Cloud computing provides on-demand compute, storage, and networking over the internet.";
const textQuery = "show me a cat";
const textKey = "cloud-computing-text";
const imageKey = "public-domain-cat-image";
const captionKey = "public-domain-cat-image#caption";
const captionPrompt = "What is in this image? Answer in one short sentence, naming the main subject.";

// #region clients-and-index
const client = new S3VectorsClient({ region });
const bedrock = new BedrockRuntimeClient({ region });
const tags = { "qut-username": qutUsername, purpose: "practical" };
// #endregion clients-and-index

// #region embed-with-titan
async function invokeTitan(payload) {
  // Bedrock creates the embedding; S3 Vectors stores and searches it.
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: titanMultimodalModelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  }));
  return JSON.parse(new TextDecoder().decode(response.body)).embedding;
}

function embedText(text) {
  return invokeTitan({ inputText: text, embeddingConfig: { outputEmbeddingLength: dimension } });
}

async function embedImage(imagePath) {
  // Read the original image locally; its bytes are not stored in S3 Vectors.
  const imageBytes = await readFile(imagePath);
  return invokeTitan({
    inputImage: imageBytes.toString("base64"),
    embeddingConfig: { outputEmbeddingLength: dimension },
  });
}
// #endregion embed-with-titan

// #region caption-with-gemma
async function describeImage(imagePath) {
  // A vision model turns the image into text that a text query can reach.
  const response = await bedrock.send(new ConverseCommand({
    modelId: visionModelId,
    messages: [{
      role: "user",
      content: [
        { text: captionPrompt },
        { image: { format: "jpeg", source: { bytes: await readFile(imagePath) } } },
      ],
    }],
    inferenceConfig: { maxTokens: 100, temperature: 0.2 },
  }));
  return (response.output.message.content ?? [])
    .filter((block) => block.text !== undefined)
    .map((block) => block.text)
    .join("")
    .trim();
}
// #endregion caption-with-gemma

async function createUnlessExists(command, description) {
  try {
    await client.send(command);
    console.log(`Created ${description}`);
  } catch (error) {
    if (error.name !== "ConflictException") throw error;
    console.log(`Using existing ${description}`);
  }
}

// #region create-index
// A vector bucket is the top-level container for one or more indexes.
await createUnlessExists(
  new CreateVectorBucketCommand({ vectorBucketName, tags }),
  `vector bucket ${vectorBucketName}`,
);
// An index fixes the data type, dimension, and similarity metric.
await createUnlessExists(
  new CreateIndexCommand({
    vectorBucketName,
    indexName,
    dataType: "float32",
    dimension,
    distanceMetric: "cosine",
    tags,
  }),
  `vector index ${indexName}`,
);
// #endregion create-index

// #region put-vectors
// PutVectors upserts by key: reusing a key replaces that vector.
// In production, location would be the real path of the stored image.
const catImagePath = new URL("./cat.jpg", import.meta.url);
const imageMetadata = {
  kind: "image",
  filename: "cat.jpg",
  description: "A cat stretching out on grass",
  location: `s3://${vectorBucketName}-assets/images/cat.jpg`,
};
await client.send(new PutVectorsCommand({
  vectorBucketName,
  indexName,
  vectors: [
    {
      // This key identifies the text item independently of its embedding.
      key: textKey,
      data: { float32: await embedText(textDocument) },
      metadata: {
        kind: "text",
        text: textDocument,
        location: `s3://${vectorBucketName}-assets/documents/cloud-computing.txt`,
      },
    },
    {
      key: imageKey,
      data: { float32: await embedImage(catImagePath) },
      metadata: imageMetadata,
    },
  ],
}));
// #endregion put-vectors

// #region query-vectors
// Embed the search phrase with the same model and query the shared index.
async function query(text) {
  const result = await client.send(new QueryVectorsCommand({
    vectorBucketName,
    indexName,
    queryVector: { float32: await embedText(text) },
    topK: 3,
    returnDistance: true,
    returnMetadata: true,
  }));
  console.log(`\nResults for text query: "${text}"`);
  for (const vector of result.vectors ?? []) {
    const metadata = vector.metadata ?? {};
    const kind = metadata.kind === "image" ? "Image" : "Text";
    const label = metadata.kind === "image"
      ? `${metadata.filename} — ${metadata.description}`
      : metadata.text;
    console.log(`${kind} ${vector.distance.toFixed(3)}: ${label}`);
    console.log(`        location: ${metadata.location}`);
  }
}

await query(textQuery);
// #endregion query-vectors

// #region caption-and-store
// A caption converts the image into text that a text query can reach.
const caption = await describeImage(catImagePath);
console.log(`\nVision model caption: ${caption}`);
await client.send(new PutVectorsCommand({
  vectorBucketName,
  indexName,
  vectors: [
    {
      // Store each representation of an item under its own key.
      key: captionKey,
      data: { float32: await embedText(caption) },
      metadata: { ...imageMetadata, description: caption },
    },
  ],
}));
// #endregion caption-and-store

// The caption embedding shares a modality with the text query.
await query(textQuery);
