#!/bin/bash
set -e

# Usage: ./deploy.sh [personal|team]
#   personal - smooth onboarding (anonymous read enabled, default)
#   team     - strict mode (anonymous read disabled)
PROFILE="${1:-${SKIFY_PROFILE:-personal}}"
if [ "$PROFILE" != "personal" ] && [ "$PROFILE" != "team" ]; then
  echo "❌ Invalid profile: $PROFILE (expected personal or team)"
  exit 1
fi

ALLOW_ANONYMOUS_READ=true
if [ "$PROFILE" = "team" ]; then
  ALLOW_ANONYMOUS_READ=false
fi

echo "🚀 Deploying Skills Hub with Docker..."
echo "👤 Profile: $PROFILE (ALLOW_ANONYMOUS_READ=$ALLOW_ANONYMOUS_READ)"

cd "$(dirname "$0")"

if [ -z "$API_TOKEN" ]; then
  API_TOKEN=$(openssl rand -hex 32)
  echo "🔑 Generated API token: $API_TOKEN"
  echo ""
  echo "Save this token! You'll need it to configure the CLI."
fi

export API_TOKEN
export ALLOW_ANONYMOUS_READ

echo "📦 Building and starting containers..."
docker-compose up -d --build

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Services:"
echo "  API: http://localhost:8787"
echo "  Web: http://localhost:3000"
echo ""
echo "Configure CLI:"
echo "  skify config set registry http://localhost:8787"
echo "  skify config set token $API_TOKEN"
