#!/bin/bash
set -e

echo "🚀 Deploying Skills Hub with Docker..."

cd "$(dirname "$0")"

if [ -z "$API_TOKEN" ]; then
  API_TOKEN=$(openssl rand -hex 32)
  echo "🔑 Generated API token: $API_TOKEN"
  echo ""
  echo "Save this token! You'll need it to configure the CLI."
fi

export API_TOKEN

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
echo "  skit config set registry http://localhost:8787"
echo "  skit config set token $API_TOKEN"
