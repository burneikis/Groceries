#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Groceries App Deploy ==="
echo ""

echo "[1/5] Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
npm install --omit=dev

echo "[2/5] Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
npm install

echo "[3/5] Running frontend tests..."
npm test

echo "[4/5] Building frontend..."
npm run build

# Only replace the served build once the new one exists
echo "[5/5] Publishing frontend build..."
rm -rf "$SCRIPT_DIR/backend/public"
cp -r "$SCRIPT_DIR/frontend/dist" "$SCRIPT_DIR/backend/public"

echo ""
echo "=== Build complete! ==="
echo ""
echo "To start the app:"
echo "  cd backend && NODE_ENV=production npm start"
echo ""
echo "To start with PM2:"
echo "  cd backend && pm2 start ecosystem.config.cjs"
echo ""
echo "The app will be available at http://localhost:${PORT:-3000}"
