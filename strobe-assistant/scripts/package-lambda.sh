#!/usr/bin/env bash
set -euo pipefail

NAME="$1"                 # heartbeat or classifier
OUT="dist/$NAME"

rm -rf "$OUT" "dist/$NAME.zip"
mkdir -p "$OUT/lambdas/$NAME" "$OUT/src"

cp lambdas/"$NAME"/*.mjs "$OUT/lambdas/$NAME/"
cp -R src/shared "$OUT/src/"
cp package.json package-lock.json "$OUT/"

(cd "$OUT" && npm ci --omit=dev --silent && zip -qr "../$NAME.zip" .)

echo "Built dist/$NAME.zip ($(du -h "dist/$NAME.zip" | cut -f1))"