#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get version bump type (patch, minor, major)
BUMP=${1:-patch}

if [[ ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Usage: ./scripts/publish.sh [patch|minor|major]${NC}"
  exit 1
fi

# Function to bump version
bump_version() {
  local version=$1
  local bump=$2
  IFS='.' read -r major minor patch <<< "$version"
  
  case $bump in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    patch) echo "$major.$minor.$((patch + 1))" ;;
  esac
}

# Function to get current version from package.json
get_version() {
  node -p "require('./$1/package.json').version"
}

# Function to set version in package.json
set_version() {
  local pkg=$1
  local version=$2
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('./$pkg/package.json', 'utf8'));
    pkg.version = '$version';
    fs.writeFileSync('./$pkg/package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
}

cd "$(dirname "$0")/.."

echo -e "${YELLOW}Building packages...${NC}"
pnpm build

# Publish core first
CORE_VERSION=$(get_version packages/core)
NEW_CORE_VERSION=$(bump_version "$CORE_VERSION" "$BUMP")

echo -e "${YELLOW}Publishing @skify/core: $CORE_VERSION -> $NEW_CORE_VERSION${NC}"
set_version packages/core "$NEW_CORE_VERSION"
cd packages/core
pnpm publish --access public --no-git-checks
cd ../..

# Publish cli
CLI_VERSION=$(get_version packages/cli)
NEW_CLI_VERSION=$(bump_version "$CLI_VERSION" "$BUMP")

echo -e "${YELLOW}Publishing @skify/cli: $CLI_VERSION -> $NEW_CLI_VERSION${NC}"
set_version packages/cli "$NEW_CLI_VERSION"
cd packages/cli
pnpm publish --access public --no-git-checks
cd ../..

# Git commit and tag
echo -e "${YELLOW}Creating git commit and tag...${NC}"
git add packages/core/package.json packages/cli/package.json
git commit -m "release: v$NEW_CLI_VERSION"
git tag "v$NEW_CLI_VERSION"

echo -e "${GREEN}Published successfully!${NC}"
echo -e "  @skify/core@$NEW_CORE_VERSION"
echo -e "  @skify/cli@$NEW_CLI_VERSION"
echo ""
echo -e "${YELLOW}Run 'git push && git push --tags' to push to remote${NC}"
