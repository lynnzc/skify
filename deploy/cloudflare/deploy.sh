#!/bin/bash
set -e

# Usage: ./deploy.sh [worker|web|all]
#   worker - deploy Worker only
#   web    - deploy Web UI only
#   all    - deploy everything (default)

DEPLOY_TARGET="${1:-all}"

echo "🚀 Deploying Skills Hub to Cloudflare..."

if ! command -v wrangler &> /dev/null; then
    echo "Installing wrangler..."
    npm install -g wrangler
fi

cd "$(dirname "$0")/../../packages/worker"

DB_NAME="skit-db"
BUCKET_NAME="skit-storage"

if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "worker" ]; then
    echo "📦 Setting up D1 database..."
    DB_OUTPUT=$(wrangler d1 create "$DB_NAME" 2>&1 || true)
    if echo "$DB_OUTPUT" | grep -q "already exists"; then
        echo "   Database already exists"
        DB_ID=$(wrangler d1 info "$DB_NAME" 2>/dev/null | grep -oE '[0-9a-f-]{36}' | head -1 || echo "")
    else
        DB_ID=$(echo "$DB_OUTPUT" | grep -oE '[0-9a-f-]{36}' | head -1)
        echo "   Created: $DB_ID"
    fi

    echo "📦 Setting up R2 bucket..."
    R2_OUTPUT=$(wrangler r2 bucket create "$BUCKET_NAME" 2>&1 || true)
    if echo "$R2_OUTPUT" | grep -q "already exists"; then
        echo "   Bucket already exists"
    else
        echo "   Created: $BUCKET_NAME"
    fi

    if [ -n "$DB_ID" ]; then
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
    wrangler d1 execute "$DB_NAME" --file=./schema.sql --remote 2>/dev/null || true

    echo "🚀 Deploying Worker..."
    WORKER_OUTPUT=$(wrangler deploy 2>&1)
    echo "$WORKER_OUTPUT"

    if [ -z "$WORKER_URL" ]; then
        WORKER_URL=$(echo "$WORKER_OUTPUT" | grep -oE 'https://[^[:space:]]+\.workers\.dev' | head -1)
    fi
fi

if [ "$DEPLOY_TARGET" = "web" ] && [ -z "$WORKER_URL" ]; then
    echo "❌ Error: WORKER_URL is required when deploying web only"
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
    wrangler pages deploy dist --project-name=skit-web

    rm -f .env.production
fi

echo ""
echo "✅ Deployment complete!"
echo ""

if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "worker" ]; then
    cd "$(dirname "$0")/../../packages/worker"

    if [ -z "$SKIP_TOKEN" ]; then
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
echo "Web UI: https://skit-web.pages.dev"
echo ""
if [ -n "$WORKER_URL" ]; then
    echo "Configure CLI:"
    echo "  skit config set registry $WORKER_URL"
    echo "  skit config set token <your-api-token>"
fi
