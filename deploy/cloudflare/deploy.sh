#!/bin/bash
set -euo pipefail

# Usage: ./deploy.sh [worker|web|all]
#   worker - deploy Worker only
#   web    - deploy Web UI only
#   all    - deploy everything (default)

DEPLOY_TARGET="${1:-all}"
WORKER_URL="${WORKER_URL:-}"

echo "🚀 Deploying Skills Hub to Cloudflare..."

if ! command -v wrangler &> /dev/null; then
    echo "Installing wrangler..."
    npm install -g wrangler
fi

cd "$(dirname "$0")/../../packages/worker"

DB_NAME="skify-db"
BUCKET_NAME="skify-storage"

if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "worker" ]; then
    echo "📦 Setting up D1 database..."
    DB_OUTPUT=""
    if DB_OUTPUT=$(wrangler d1 create "$DB_NAME" 2>&1); then
        DB_ID=$(echo "$DB_OUTPUT" | grep -oE '[0-9a-f-]{36}' | head -1 || true)
        if [ -n "${DB_ID:-}" ]; then
            echo "   Created: $DB_ID"
        fi
    else
        if echo "$DB_OUTPUT" | grep -qi "already exists"; then
            echo "   Database already exists"
            DB_ID=$(wrangler d1 info "$DB_NAME" 2>/dev/null | grep -oE '[0-9a-f-]{36}' | head -1 || true)
        else
            echo "❌ Failed to create D1 database:"
            echo "$DB_OUTPUT"
            exit 1
        fi
    fi

    echo "📦 Setting up R2 bucket..."
    R2_OUTPUT=""
    if R2_OUTPUT=$(wrangler r2 bucket create "$BUCKET_NAME" 2>&1); then
        echo "   Created: $BUCKET_NAME"
    else
        if echo "$R2_OUTPUT" | grep -qi "already exists"; then
            echo "   Bucket already exists"
        else
            echo "❌ Failed to create R2 bucket:"
            echo "$R2_OUTPUT"
            exit 1
        fi
    fi

    if [ -n "${DB_ID:-}" ]; then
        CURRENT_DB_ID=$(grep 'database_id' wrangler.toml | sed 's/.*database_id = "\([^"]*\)".*/\1/' || echo "")
        if [ "$CURRENT_DB_ID" != "$DB_ID" ]; then
            echo "🔧 Updating wrangler.toml with database_id: $DB_ID"
            sed -i.bak "s/database_id = \".*\"/database_id = \"$DB_ID\"/" wrangler.toml
            rm -f wrangler.toml.bak
        fi
    else
        echo "⚠️  Could not get database_id. Please update wrangler.toml manually."
        echo "   Run: wrangler d1 list"
    fi

    echo "🗄️ Initializing database schema..."
    wrangler d1 execute "$DB_NAME" --file=./schema.sql --remote

    echo "🚀 Deploying Worker..."
    WORKER_OUTPUT=$(wrangler deploy 2>&1)
    echo "$WORKER_OUTPUT"

    if [ -z "$WORKER_URL" ]; then
        WORKER_URL=$(echo "$WORKER_OUTPUT" | grep -oE 'https://[^[:space:]]+\.workers\.dev' | head -1)
    fi

    if [ -z "$WORKER_URL" ]; then
        echo "❌ Could not detect Worker URL from deploy output."
        exit 1
    fi
fi

if { [ "$DEPLOY_TARGET" = "web" ] || [ "$DEPLOY_TARGET" = "all" ]; } && [ -z "$WORKER_URL" ]; then
    echo "❌ Error: WORKER_URL is required for web deployment"
    echo ""
    echo "Usage: WORKER_URL=https://your-api.workers.dev ./deploy.sh web"
    echo "   or: ./deploy.sh all  (to deploy both worker and web)"
    exit 1
fi

if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "web" ]; then
    echo ""
    echo "📦 Building and deploying Web UI..."
    cd "$(dirname "$0")/../../packages/web"

    cat > .env.production <<EOF
VITE_API_URL=$WORKER_URL
EOF

    pnpm install
    pnpm build

    echo "🚀 Deploying to Cloudflare Pages..."
    wrangler pages deploy dist --project-name=skify-web

    rm -f .env.production
fi

if [ -n "$WORKER_URL" ]; then
    echo "🏥 Running health check..."
    if ! command -v curl &> /dev/null; then
        echo "❌ curl is required for health checks. Please install curl and retry."
        exit 1
    fi
    HEALTH_BODY=$(curl -fsS "$WORKER_URL/api/health")
    if ! echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
        echo "❌ Health check failed. Response: $HEALTH_BODY"
        exit 1
    fi
    echo "   Health check passed"
fi

echo ""
echo "✅ Deployment complete!"
echo ""

if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "worker" ]; then
    cd "$(dirname "$0")/../../packages/worker"

    if [ -z "${SKIP_TOKEN:-}" ]; then
        if wrangler secret list 2>/dev/null | grep -q "API_TOKEN"; then
            echo "🔑 API token already set"
        else
            echo "🔑 Setting up API token..."
            API_TOKEN=$(openssl rand -hex 32)
            echo "$API_TOKEN" | wrangler secret put API_TOKEN
            echo ""
            echo "Your API token (save this!):"
            echo "  $API_TOKEN"
        fi
    fi
fi

echo ""
if [ -n "$WORKER_URL" ]; then
    echo "API endpoint: $WORKER_URL"
fi
echo "Web UI: https://skify-web.pages.dev"
echo ""
if [ -n "$WORKER_URL" ]; then
    echo "Configure CLI:"
    echo "  skify config set registry $WORKER_URL"
    echo "  skify config set token <your-api-token>"
fi
