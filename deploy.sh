#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Groceries App Deploy ==="
echo ""

# Install backend dependencies
echo "[1/4] Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
npm install --production

# Install frontend dependencies and build
echo "[2/4] Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
npm install

echo "[3/4] Building frontend..."
npm run build

# Copy build to backend/public
echo "[4/4] Copying frontend build to backend/public..."
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
