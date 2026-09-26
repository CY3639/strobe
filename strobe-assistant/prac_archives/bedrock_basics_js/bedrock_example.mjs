/**
 * A minimal Amazon Bedrock chat example using the AWS SDK for JavaScript v3.
 *
 * Prerequisites:
 *   - AWS credentials available through the standard AWS credential chain
 *     (for example, `aws configure` or an IAM role).
 *   - Bedrock model access enabled in the region for the model you choose.
 *
 * Run:
 *   node bedrock_example.mjs
 *   node bedrock_example.mjs "Explain cloud computing in one sentence."
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const modelId = "nvidia.nemotron-super-3-120b";
const region = process.env.AWS_REGION ?? "ap-southeast-2";

async function askBedrock(prompt) {
  // The SDK finds credentials automatically via environment variables,
  // ~/.aws credentials/config files, SSO, ECS/EC2 roles, etc.
// #region text-client
const client = new BedrockRuntimeClient({ region });
// #endregion text-client

// #region text-converse-request
const command = new ConverseCommand({
    modelId,
    system: [
      {
        text: "You are a concise, helpful teaching assistant. Answer clearly and accurately.",
      },
    ],
    messages: [
      {
        role: "user",
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 300,
      temperature: 0.3,
    },
});

const response = await client.send(command);
// #endregion text-converse-request

// #region text-response
// A response can contain several content blocks. Join all text blocks.
return (response.output.message.content ?? [])
    .filter((block) => block.text !== undefined)
    .map((block) => block.text)
    .join("");
// #endregion text-response
}

async function main() {
  const prompt = process.argv.slice(2).join(" ") || "What is Amazon Bedrock?";

  try {
    const answer = await askBedrock(prompt);
    console.log(answer);
  } catch (error) {
    console.error(`Bedrock request failed: ${error.message}`);
    console.error(
      "Check AWS credentials, region, and Bedrock model access.",
    );
    process.exitCode = 1;
  }
}

await main();
