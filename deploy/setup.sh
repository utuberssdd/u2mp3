#!/bin/bash
set -e

# ============================================================
#  U2MP3.COM — Automated VPS Setup Script
#  Tested on Ubuntu 22.04 / 24.04 (Hostinger VPS)
#  Run as root: bash setup.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_step() { echo -e "\n${CYAN}==>${NC} $1"; }
print_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Ask for config ──────────────────────────────────────────
echo -e "\n${RED}╔══════════════════════════════════════╗"
echo -e "║     U2MP3.COM VPS Setup Wizard       ║"
echo -e "╚══════════════════════════════════════╝${NC}\n"

read -p "Enter your domain name (e.g. u2mp3.com): " DOMAIN
read -p "Enter your GitHub repo URL (e.g. https://github.com/user/u2mp3.git): " REPO_URL
read -p "API port [default: 4000]: " API_PORT
API_PORT=${API_PORT:-4000}
APP_DIR="/var/www/u2mp3"

echo ""
echo -e "Domain   : ${GREEN}$DOMAIN${NC}"
echo -e "Repo     : ${GREEN}$REPO_URL${NC}"
echo -e "API Port : ${GREEN}$API_PORT${NC}"
echo -e "Install  : ${GREEN}$APP_DIR${NC}"
read -p $'\nProceed? (y/n): ' CONFIRM
[[ "$CONFIRM" != "y" ]] && echo "Aborted." && exit 0

# ── System update ───────────────────────────────────────────
print_step "Updating system packages..."
apt update -qq && apt upgrade -y -qq
print_ok "System updated"

# ── Node.js 20 ──────────────────────────────────────────────
print_step "Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/dev/null
  apt install -y -qq nodejs
fi
print_ok "Node.js $(node -v)"

# ── pnpm ────────────────────────────────────────────────────
print_step "Installing pnpm..."
npm install -g pnpm &>/dev/null
print_ok "pnpm $(pnpm -v)"

# ── ffmpeg ──────────────────────────────────────────────────
print_step "Installing ffmpeg..."
apt install -y -qq ffmpeg
print_ok "ffmpeg installed"

# ── yt-dlp ──────────────────────────────────────────────────
print_step "Installing yt-dlp..."
curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
print_ok "yt-dlp $(yt-dlp --version)"

# ── PM2 ─────────────────────────────────────────────────────
print_step "Installing PM2..."
npm install -g pm2 &>/dev/null
print_ok "PM2 installed"

# ── Nginx ───────────────────────────────────────────────────
print_step "Installing Nginx..."
apt install -y -qq nginx
print_ok "Nginx installed"

# ── Clone repo ──────────────────────────────────────────────
print_step "Cloning repository..."
if [ -d "$APP_DIR" ]; then
  print_warn "$APP_DIR already exists — pulling latest changes..."
  cd "$APP_DIR" && git pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi
print_ok "Repository ready at $APP_DIR"

# ── Install dependencies ─────────────────────────────────────
print_step "Installing Node dependencies..."
cd "$APP_DIR"
pnpm install
print_ok "Dependencies installed"

# ── Build frontend ───────────────────────────────────────────
print_step "Building frontend..."
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/yt-mp3 run build
print_ok "Frontend built → artifacts/yt-mp3/dist/public"

# ── Build API server ─────────────────────────────────────────
print_step "Building API server..."
pnpm --filter @workspace/api-server run build
print_ok "API server built → artifacts/api-server/dist/index.cjs"

# ── Write ecosystem config ───────────────────────────────────
print_step "Configuring PM2..."
cat > "$APP_DIR/deploy/ecosystem.config.cjs" <<ECOSYSTEM
module.exports = {
  apps: [{
    name: 'u2mp3-api',
    script: '${APP_DIR}/artifacts/api-server/dist/index.cjs',
    env: {
      NODE_ENV: 'production',
      PORT: '${API_PORT}'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    error_file: '/var/log/u2mp3/error.log',
    out_file: '/var/log/u2mp3/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
ECOSYSTEM

mkdir -p /var/log/u2mp3
pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash &>/dev/null || true
print_ok "PM2 configured and running"

# ── Nginx config ─────────────────────────────────────────────
print_step "Configuring Nginx..."
cat > /etc/nginx/sites-available/u2mp3 <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${APP_DIR}/artifacts/yt-mp3/dist/public;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_min_length 1000;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API proxy → Express server
    location /api/ {
        proxy_pass http://localhost:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        # Long timeout for MP3 streaming downloads
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_buffering off;
    }

    # React SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/u2mp3 /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
print_ok "Nginx configured"

# ── Auto-update yt-dlp weekly ────────────────────────────────
print_step "Setting up weekly yt-dlp auto-update..."
(crontab -l 2>/dev/null; echo "0 3 * * 1 /usr/local/bin/yt-dlp -U >> /var/log/u2mp3/ytdlp-update.log 2>&1") | crontab -
print_ok "Cron job added (every Monday 3am)"

# ── SSL with Let's Encrypt ────────────────────────────────────
print_step "Installing SSL certificate (Let's Encrypt)..."
if ! command -v certbot &>/dev/null; then
  apt install -y -qq certbot python3-certbot-nginx
fi
echo ""
echo -e "${YELLOW}Make sure your DNS A records point to this server IP before continuing.${NC}"
read -p "Set up SSL now? (y/n): " DO_SSL
if [[ "$DO_SSL" == "y" ]]; then
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --redirect
  print_ok "SSL configured — site is now HTTPS"
else
  print_warn "Skipped SSL. Run later: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗"
echo -e "║        Setup Complete!                   ║"
echo -e "╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Site      : ${CYAN}http://${DOMAIN}${NC}"
echo -e "  App dir   : ${CYAN}${APP_DIR}${NC}"
echo -e "  API port  : ${CYAN}${API_PORT}${NC}"
echo -e "  PM2 logs  : ${CYAN}pm2 logs u2mp3-api${NC}"
echo -e "  Update    : ${CYAN}bash ${APP_DIR}/deploy/update.sh${NC}"
echo ""
