#!/usr/bin/env bash
# Strobe Assistant: pre-Phase-9B checkpoint (v2).
# READ-ONLY: it inspects AWS and the repo, and changes nothing.
# Run from strobe-assistant/ after `awsfresh`:   bash scripts/checkpoint.sh

set -u
export AWS_PAGER=""

SUB="c9fea4c8-e041-7036-5867-ff1564f8d1ab"
CLUSTER="n5528712-a2-cluster"
DOMAIN="n5528712.cab432.com"
PASS=0; FAIL=0

check() {   # check <label> <expected glob> <actual>
    if [[ "$3" == $2 ]]; then
        printf "  PASS  %-42s %s\n" "$1" "$3"; PASS=$((PASS + 1))
    else
        printf "  FAIL  %-42s expected %s, got '%s'\n" "$1" "$2" "$3"; FAIL=$((FAIL + 1))
    fi
}
info()    { printf "  INFO  %-42s %s\n" "$1" "$2"; }
section() { printf "\n== %s\n" "$1"; }

# The CLI pages long lists and applies --query per page, so flatten
# all pages to one value per line and drop empty/None entries.
values() { tr -s ' \t' '\n' | grep -v -e '^$' -e '^None$'; }
first()  { values | head -1; }

queue_depth() {
    local url
    url=$(aws sqs get-queue-url --queue-name "$1" --query QueueUrl --output text 2>/dev/null) || { echo "missing"; return; }
    aws sqs get-queue-attributes --queue-url "$url" --attribute-names ApproximateNumberOfMessages \
        --query Attributes.ApproximateNumberOfMessages --output text
}


section "Credentials and configuration (Phase 0)"
check "AWS account" "901444280953" "$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"
check "Parameter Store values" "13" \
    "$(aws ssm get-parameters-by-path --path /n5528712/a2 --recursive --query 'Parameters[].Name' --output text | values | wc -l | tr -d ' ')"


section "Autonomous heartbeat (Phase 1)"
check "Schedule enabled" "ENABLED" "$(aws scheduler get-schedule --name n5528712-a2-heartbeat --query State --output text)"

USER_ONLY=$(printf '{":u":{"S":"%s"}}' "$SUB")
USER_AND_TRIGGER=$(printf '{":u":{"S":"%s"},":t":{"S":"EVENTBRIDGE_SCHEDULE"}}' "$SUB")

check "Latest run status" "COMPLETE" \
    "$(aws dynamodb query --table-name n5528712-a2-agent-runs --index-name userId-startedAt-index \
        --key-condition-expression 'userId = :u' --expression-attribute-values "$USER_ONLY" \
        --no-scan-index-forward --limit 1 --query 'Items[0].status.S' --output text)"
info "Latest run trigger" \
    "$(aws dynamodb query --table-name n5528712-a2-agent-runs --index-name userId-startedAt-index \
        --key-condition-expression 'userId = :u' --expression-attribute-values "$USER_ONLY" \
        --no-scan-index-forward --limit 1 --query 'Items[0].[trigger.S, startedAt.S]' --output text)"
SCHEDULED=$(aws dynamodb query --table-name n5528712-a2-agent-runs --index-name userId-startedAt-index \
    --key-condition-expression 'userId = :u' \
    --filter-expression '#t = :t' --expression-attribute-names '{"#t":"trigger"}' \
    --expression-attribute-values "$USER_AND_TRIGGER" \
    --no-scan-index-forward --query 'Items[].startedAt.S' --output text | first)
check "A run labelled EVENTBRIDGE_SCHEDULE" "20*" "$SCHEDULED"


section "Async classification (Phases 3-4)"
check "SQS trigger on classifier" "Enabled" \
    "$(aws lambda list-event-source-mappings --function-name n5528712-a2-lambdaClassifier --query 'EventSourceMappings[0].State' --output text)"
check "Work queue drained"      "0" "$(queue_depth n5528712-a2-classification)"
check "Dead-letter queue empty" "0" "$(queue_depth n5528712-a2-classification-dlq)"
COMPLETE=$(aws dynamodb scan --table-name n5528712-a2-classifications \
    --filter-expression '#s = :c' --expression-attribute-names '{"#s":"status"}' \
    --expression-attribute-values '{":c":{"S":"COMPLETE"}}' --select COUNT --query Count --output text | values | paste -sd+ - | bc)
if [[ "$COMPLETE" =~ ^[0-9]+$ && "$COMPLETE" -ge 6 ]]; then check "Classified photos (>= 6)" "*" "$COMPLETE"
else check "Classified photos (>= 6)" ">=6" "$COMPLETE"; fi


section "MCP on ECS + secret (Phases 6, 8A, 8B)"
check "MCP service running" "1" \
    "$(aws ecs describe-services --cluster $CLUSTER --services n5528712-a2-mcp-service --query 'services[0].runningCount' --output text)"
info "MCP task definition" \
    "$(aws ecs describe-services --cluster $CLUSTER --services n5528712-a2-mcp-service --query 'services[0].taskDefinition' --output text)"
TASK=$(aws ecs list-tasks --cluster $CLUSTER --service-name n5528712-a2-mcp-service --query 'taskArns[0]' --output text)
ENI=$(aws ecs describe-tasks --cluster $CLUSTER --tasks "$TASK" \
    --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text)
IP=$(aws ec2 describe-network-interfaces --network-interface-ids "$ENI" --query 'NetworkInterfaces[0].Association.PublicIp' --output text 2>/dev/null)
check "MCP /healthz" "ok" "$(curl -s --max-time 5 http://$IP:3000/healthz)"
check "MCP rejects anonymous POST" "401" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST http://$IP:3000/mcp)"
check "Service-key secret exists" "n5528712-a2-mcp-service-key" \
    "$(aws secretsmanager describe-secret --secret-id n5528712-a2-mcp-service-key --query Name --output text)"


section "Phase 9A preparation"
check "Certificate $DOMAIN" "ISSUED" \
    "$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='$DOMAIN'].Status" --output text | first)"
check "Unused -strobe cert deleted" "" \
    "$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='n5528712-strobe.cab432.com'].CertificateArn" --output text | first)"
CERT_ARN=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn" --output text | first)
check "Certificate tagged for A2" "assessment 2" \
    "$(aws acm list-tags-for-certificate --certificate-arn "$CERT_ARN" --query "Tags[?Key=='purpose'].Value | [0]" --output text)"
check "ECR agent has v1" "*v1*" \
    "$(aws ecr describe-images --repository-name a2/n5528712-agent --query 'imageDetails[].imageTags[]' --output text 2>/dev/null)"
check "ECR webui has an image" "v*" \
    "$(aws ecr describe-images --repository-name a2/n5528712-webui --query 'imageDetails[].imageTags[]' --output text 2>/dev/null)"
check "CORS allows https://$DOMAIN" "*https://$DOMAIN*" \
    "$(aws apigatewayv2 get-api --api-id rw6ev7gjr3 --query 'CorsConfiguration.AllowOrigins' --output text)"
check "WebUI endpoint in main.ts" "wss://$DOMAIN/acp" \
    "$(grep 'const ACP_WEBSOCKET_ENDPOINT' acp_client/web/main.ts | grep -o 'wss://[^"]*')"
ZONE=$(aws route53 list-hosted-zones-by-name --dns-name cab432.com --query 'HostedZones[0].Id' --output text)
RECORD=$(aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" \
    --query "ResourceRecordSets[?Name=='$DOMAIN.'].Type" --output text | first)
info "Route 53 record for $DOMAIN" "${RECORD:-none (free; Part B creates it)}"


section "Retrieval quality"
info "Eval scorecard" "$(node scripts/eval-search.mjs 2>/dev/null | tail -1)"


section "Housekeeping"
echo "  INFO  Tagged resources NOT purpose=assessment 2 (fine unless one is in your YAML):"
aws resourcegroupstaggingapi get-resources --tag-filters Key=qut-username,Values=n5528712@qut.edu.au \
    --query "ResourceTagMappingList[?!(Tags[?Key=='purpose' && Value=='assessment 2'])].ResourceARN" --output text \
    | values | sed 's/^/          /'
info "Uncommitted files" "$(git status --porcelain | wc -l | tr -d ' ')"


printf "\n%d passed, %d failed\n" "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]] && echo "Ready for Phase 9 Part B." || echo "Fix the FAIL lines before Part B."
