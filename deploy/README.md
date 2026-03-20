# U2MP3.COM — VPS Deployment Guide

## Quick Setup (Automated)

1. Push this project to GitHub
2. SSH into your Hostinger VPS as root
3. Run:

```bash
git clone https://github.com/YOUR_USERNAME/u2mp3.git /var/www/u2mp3
cd /var/www/u2mp3
bash deploy/setup.sh
```

The script will ask for your domain name and handle everything automatically.

---

## What the Setup Script Does

- Installs Node.js 20, pnpm, ffmpeg, yt-dlp
- Installs PM2 (keeps the server running 24/7)
- Installs Nginx (serves frontend + proxies API)
- Clones your repo and builds both frontend and backend
- Configures Nginx with MP3 streaming support
- Sets up SSL (Let's Encrypt / HTTPS) automatically
- Adds a weekly cron job to keep yt-dlp updated

---

## Updating the Site

After pushing new code to GitHub, SSH into your VPS and run:

```bash
bash /var/www/u2mp3/deploy/update.sh
```

---

## Useful Commands

```bash
# Check if API server is running
pm2 status

# View live API logs
pm2 logs u2mp3-api

# Restart API server
pm2 restart u2mp3-api

# Check Nginx status
systemctl status nginx

# Reload Nginx after config changes
nginx -t && systemctl reload nginx

# Manually update yt-dlp
yt-dlp -U
```

---

## File Structure on VPS

```
/var/www/u2mp3/
├── artifacts/
│   ├── yt-mp3/dist/public/   ← Built frontend (served by Nginx)
│   └── api-server/dist/      ← Built API server (run by PM2)
├── deploy/
│   ├── setup.sh              ← First-time setup
│   ├── update.sh             ← Pull & rebuild
│   └── nginx.conf            ← Nginx config template
└── ...
```

---

## Requirements

- Ubuntu 22.04 or 24.04 VPS (Hostinger KVM2 or higher recommended)
- A domain name pointed to your VPS IP (A record)
- Root SSH access
