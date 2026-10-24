#!/usr/bin/env bash
set -euo pipefail

# 设定创作器 v6 —— 本机或远端一键构建与部署脚本

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "==> [1/4] Building frontend & Go binaries..."
make build

echo "==> [2/4] Preparing runtime directories..."
mkdir -p /data/creator/data/avatars /data/creator/data/backups

if [[ ! -f "${ROOT_DIR}/deploy/creator.env" ]]; then
  cp "${ROOT_DIR}/deploy/creator.env.example" "${ROOT_DIR}/deploy/creator.env"
fi

echo "==> [3/4] Installing systemd unit..."
if command -v systemctl >/dev/null 2>&1; then
  sudo cp "${ROOT_DIR}/deploy/creator.service" /etc/systemd/system/creator.service
  sudo systemctl daemon-reload
  sudo systemctl enable creator
  sudo systemctl restart creator
  sleep 1
  sudo systemctl status creator --no-pager || true
fi

echo "==> [4/4] Verifying healthz endpoint..."
curl -fsS http://127.0.0.1:8080/api/healthz && echo ""
echo "✅ Deployment complete!"
