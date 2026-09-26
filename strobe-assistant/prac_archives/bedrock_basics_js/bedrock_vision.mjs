/** Describe a local image with a vision-capable Amazon Bedrock model. */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const region = process.env.AWS_REGION ?? "ap-southeast-2";
const modelId = "google.gemma-3-12b-it";
const imagePath = process.argv[2];
// #region image-format
const formats = { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".gif": "gif", ".webp": "webp" };
// #endregion image-format

if (!imagePath || !formats[extname(imagePath).toLowerCase()]) {
  throw new Error("Run: node bedrock_vision.mjs path/to/image.png");
}

// #region vision-client
const client = new BedrockRuntimeClient({ region });
// #endregion vision-client
const imageBytes = await readFile(imagePath);
// #region vision-converse-request
const response = await client.send(
  new ConverseCommand({
    modelId,
    messages: [{
      role: "user",
      content: [
        { text: "Describe this image for use in an image-search index. Be concise." },
        { image: { format: formats[extname(imagePath).toLowerCase()], source: { bytes: imageBytes } } },
      ],
    }],
    inferenceConfig: { maxTokens: 300, temperature: 0.2 },
  }),
);
// #endregion vision-converse-request

// #region vision-response
console.log((response.output.message.content ?? [])
  .filter((block) => block.text !== undefined)
  .map((block) => block.text)
  .join(""));
// #endregion vision-response
