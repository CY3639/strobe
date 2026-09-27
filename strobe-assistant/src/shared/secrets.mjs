import {
    SecretsManagerClient,
    GetSecretValueCommand
} from "@aws-sdk/client-secrets-manager";

import { REGION } from "./aws.mjs";

const client = new SecretsManagerClient({ region: REGION });
const cache = new Map();

// Read once per process; secrets are cached in memory, never logged.
async function getSecretJson(secretId) {
    if (!cache.has(secretId)) {
        const { SecretString } = await client.send(
            new GetSecretValueCommand({ SecretId: secretId })
        );
        cache.set(secretId, JSON.parse(SecretString));
    }
    return cache.get(secretId);
}

export async function getServiceKey(secretId) {
    const { serviceKey } = await getSecretJson(secretId);
    if (!serviceKey) {
        throw new Error(`Secret ${secretId} has no serviceKey field.`);
    }
    return serviceKey;
}