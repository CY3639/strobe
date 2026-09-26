import {
    BedrockRuntimeClient
} from "@aws-sdk/client-bedrock-runtime";

import {
    DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
    DynamoDBDocumentClient
} from "@aws-sdk/lib-dynamodb";

import {
    S3Client
} from "@aws-sdk/client-s3";

import {
    S3VectorsClient
} from "@aws-sdk/client-s3vectors";

import {
    SSMClient
} from "@aws-sdk/client-ssm";


export const REGION = "ap-southeast-2";


export const bedrock = new BedrockRuntimeClient({
    region: REGION
});


const lowLevelDynamoDB = new DynamoDBClient({
    region: REGION
});


export const dynamodb = DynamoDBDocumentClient.from(
    lowLevelDynamoDB,
    {
        marshallOptions: {
            removeUndefinedValues: true
        }
    }
);


export const s3 = new S3Client({
    region: REGION
});


export const s3Vectors = new S3VectorsClient({
    region: REGION
});


export const ssm = new SSMClient({
    region: REGION
});