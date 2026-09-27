import { loadConfig } from "../src/shared/config.mjs";
import { getS3ObjectBytes, detectImageFormat } from "../src/shared/s3.mjs";
import { classifyImage } from "../src/shared/bedrock.mjs";

const key = process.argv[2];
if (!key) {
    console.error("Usage: node scripts/classify-one.mjs <s3-key>");
    process.exit(1);
}

const config = await loadConfig();
const { bytes } = await getS3ObjectBytes({ bucket: config.uploadsBucket, key });
const imageFormat = detectImageFormat(bytes);

console.log({ sizeMB: (bytes.length / 1e6).toFixed(2), imageFormat });

try {
    console.log(await classifyImage({
        modelId: config.visionModelId,
        imageBytes: bytes,
        imageFormat
    }));
} catch (error) {
    console.error({
        name: error.name,
        httpStatus: error.$metadata?.httpStatusCode,
        message: error.message
    });
}