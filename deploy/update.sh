#!/bin/bash
set -e

# ============================================================
#  U2MP3.COM — Update Script
#  Run from the project root: bash deploy/update.sh
# ============================================================

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "\n${CYAN}==> Pulling latest code...${NC}"
cd "$APP_DIR"
git pull

echo -e "${CYAN}==> Installing dependencies...${NC}"
pnpm install

echo -e "${CYAN}==> Building frontend...${NC}"
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/yt-mp3 run build

echo -e "${CYAN}==> Building API server...${NC}"
pnpm --filter @workspace/api-server run build

echo -e "${CYAN}==> Restarting API server...${NC}"
pm2 restart u2mp3-api

echo -e "${CYAN}==> Updating yt-dlp...${NC}"
yt-dlp -U || true

echo ""
echo -e "${GREEN}Update complete!${NC}"
pm2 status u2mp3-api
