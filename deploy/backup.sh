#!/usr/bin/env bash
set -euo pipefail

# 设定创作器 v6 —— SQLite 在线热备份 + 头像归档脚本 (14 天自动轮转)
# Cron 示例 (每日凌晨 03:00 执行):
# 0 3 * * * /data/creator/deploy/backup.sh >> /data/creator/data/backup.log 2>&1

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/data/creator/data/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [[ -f "${ROOT_DIR}/deploy/creator.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/deploy/creator.env"
  set +a
fi

echo "[$(date -Iseconds)] Starting online backup to ${BACKUP_DIR}..."
"${ROOT_DIR}/bin/creator" backup --out "${BACKUP_DIR}" --keep-days "${KEEP_DAYS}"
echo "[$(date -Iseconds)] Backup finished successfully."
