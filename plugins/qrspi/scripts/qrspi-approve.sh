#!/bin/bash
set -euo pipefail

FEATURE_ID="${1:-}"
NOTE_FILE="${2:-}"
ROOT_DIR="${3:-.}"

if [ -z "$FEATURE_ID" ] || [ -z "$NOTE_FILE" ]; then
  echo "usage: $0 <feature_id> <note_file> [root_dir]" >&2
  exit 1
fi

node packages/qrspi/dist/cli/main.js approve --root "$ROOT_DIR" --feature "$FEATURE_ID" --note-file "$NOTE_FILE" --json
