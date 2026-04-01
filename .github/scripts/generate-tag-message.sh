#!/usr/bin/env bash
set -euo pipefail

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
RANGE="${LAST_TAG:+${LAST_TAG}..HEAD}"
RANGE="${RANGE:-HEAD}"
LOG=$(git log --oneline $RANGE)

MSG=""

if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ -n "$LOG" ]; then
  SYSTEM=$(cat "$(dirname "$0")/../prompts/tag-message.prompt.md")

  PAYLOAD=$(jq -n \
    --arg model "claude-haiku-4-5-20251001" \
    --arg system "$SYSTEM" \
    --arg log "$LOG" \
    '{
      model: $model,
      max_tokens: 128,
      system: $system,
      messages: [{role: "user", content: $log}]
    }')

  MSG=$(curl -sf https://api.anthropic.com/v1/messages \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$PAYLOAD" 2>/dev/null | jq -r '.content[0].text // ""' 2>/dev/null || echo "")
fi

{
  echo "message<<TAGMSGEOF"
  echo "$MSG"
  echo "TAGMSGEOF"
} >> "$GITHUB_OUTPUT"
