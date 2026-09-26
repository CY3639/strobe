import {
  GetParametersCommand,
  SSMClient
} from "@aws-sdk/client-ssm";

const REGION = "ap-southeast-2";

const ssm = new SSMClient({
  region: REGION
});

const PARAMETER_NAMES = {
  apiBaseUrl:
    "/n5528712/a2/strobe-api-base-url",

  userPoolId:
    "/n5528712/a2/cognito-user-pool-id",

  clientId:
    "/n5528712/a2/cognito-client-id"
};

export async function loadConfig() {
  const names = Object.values(PARAMETER_NAMES);

  const result = await ssm.send(
    new GetParametersCommand({
      Names: names,
      WithDecryption: true
    })
  );

  const values = new Map(
    (result.Parameters ?? []).map(parameter => [
      parameter.Name,
      parameter.Value
    ])
  );

  const missing = names.filter(
    name => !values.get(name)
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing SSM parameters: ${missing.join(", ")}`
    );
  }

  return {
    region: REGION,

    apiBaseUrl:
      values.get(PARAMETER_NAMES.apiBaseUrl),

    userPoolId:
      values.get(PARAMETER_NAMES.userPoolId),

    clientId:
      values.get(PARAMETER_NAMES.clientId)
  };
}