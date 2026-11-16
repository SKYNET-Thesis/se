#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("VISTA local development requires Node.js 22 or newer."); process.exit(1); }'
npm --version >/dev/null

echo "Installing Education API dependencies from its lockfile..."
(cd "$ROOT_DIR/services/education-api" && npm ci)

echo "Installing Robot Education Web dependencies from its lockfile..."
(cd "$ROOT_DIR/web/robot-edu" && npm ci)

echo "Dependencies installed. Follow docs/setup/local-education-development.md to create a disposable local database and start the services."
