#!/bin/bash
set -euo pipefail

FEATURE_ID="${1:-}"
ROOT_DIR="${2:-.}"

if [ -z "$FEATURE_ID" ]; then
  echo "usage: $0 <feature_id> [root_dir]" >&2
  exit 1
fi

node packages/qrspi/dist/cli/main.js status --root "$ROOT_DIR" --feature "$FEATURE_ID" --json
