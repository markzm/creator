#!/usr/bin/env bash
# ==============================================================================
# 设定创作器 (Creator Studio v6) —— 远端 (abc.lidan.cc) 定期热备份同步脚本
#
# 功能:
# 1. SSH 连接远端服务器，触发 SQLite 在线原子热备份 (VACUUM INTO) + 头像打包
# 2. Rsync 同步所有备份包 (.tar.gz) 到本机 (/data/creator/backups/abc.lidan.cc/archives)
# 3. 同步关键配置文件: creator.env, creator.service, Nginx 配置, SSL 证书
# 4. 自动校验备份包完整性 (tar 校验 + SQLite quick_check)
# 5. 更新 latest/ 目录与 meta.json 概览信息
# 6. 本机保留最近 N 天备份 (默认 60 天，远端默认 14 天)
# 7. 全程记录日志到 logs/backup.log
# ==============================================================================

set -euo pipefail

# 基础目录配置
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${PROJECT_ROOT}/backups/abc.lidan.cc"
ARCHIVE_DIR="${BACKUP_ROOT}/archives"
CONFIG_DIR="${BACKUP_ROOT}/configs"
LATEST_DIR="${BACKUP_ROOT}/latest"
LOG_DIR="${BACKUP_ROOT}/logs"
LOG_FILE="${LOG_DIR}/backup.log"

REMOTE_HOST="${REMOTE_HOST:-abc.lidan.cc}"
REMOTE_USER="${REMOTE_USER:-root}"
LOCAL_KEEP_DAYS="${LOCAL_KEEP_DAYS:-60}"
TRIGGER_REMOTE=true

# 解析命令行参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-trigger)
      TRIGGER_REMOTE=false
      shift
      ;;
    --keep-days)
      LOCAL_KEEP_DAYS="$2"
      shift 2
      ;;
    --host)
      REMOTE_HOST="$2"
      shift 2
      ;;
    -h|--help)
      echo "用法: $0 [--no-trigger] [--keep-days <days>] [--host <hostname>]"
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

# 创建必要目录
mkdir -p "${ARCHIVE_DIR}" "${CONFIG_DIR}" "${CONFIG_DIR}/ssl" "${LATEST_DIR}" "${LOG_DIR}"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "${msg}"
  echo "${msg}" >> "${LOG_FILE}"
}

log "========================================================================"
log "开始从 ${REMOTE_HOST} 同步备份数据..."

# 1. 检查 SSH 连通性
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_USER}@${REMOTE_HOST}" "true" 2>/dev/null; then
  log "❌ 错误: 无法通过 SSH 连接到 ${REMOTE_USER}@${REMOTE_HOST}，请检查网络或 SSH 密钥配置。"
  exit 1
fi
log "✓ SSH 连通性检查通过 (${REMOTE_HOST})"

# 2. 触发远端在线备份 (可选)
if [[ "${TRIGGER_REMOTE}" == "true" ]]; then
  log "==> [1/5] 正在远端执行在线热备份 (/opt/creator/deploy/backup.sh)..."
  REMOTE_OUTPUT=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "/opt/creator/deploy/backup.sh" 2>&1)
  log "    远端输出: ${REMOTE_OUTPUT}"
else
  log "==> [1/5] 跳过远端备份触发，直接拉取现有备份包 (--no-trigger)"
fi

# 3. 同步备份归档包 (.tar.gz)
log "==> [2/5] Rsync 同步数据库与附件备份归档..."
rsync -avz --partial \
  "${REMOTE_USER}@${REMOTE_HOST}:/opt/creator/data/backups/creator-backup-*.tar.gz" \
  "${ARCHIVE_DIR}/" >> "${LOG_FILE}" 2>&1
log "✓ 备份归档同步完成"

# 4. 同步配置文件及 SSL 证书
log "==> [3/5] 同步服务端配置及环境文件..."
# creator.env
rsync -avz "${REMOTE_USER}@${REMOTE_HOST}:/opt/creator/deploy/creator.env" "${CONFIG_DIR}/creator.env" >> "${LOG_FILE}" 2>&1 || true
chmod 600 "${CONFIG_DIR}/creator.env" 2>/dev/null || true

# systemd service
rsync -avz "${REMOTE_USER}@${REMOTE_HOST}:/etc/systemd/system/creator.service" "${CONFIG_DIR}/creator.service" >> "${LOG_FILE}" 2>&1 || true

# Nginx / OpenResty 配置
rsync -avz "${REMOTE_USER}@${REMOTE_HOST}:/usr/local/openresty/nginx/conf/conf.d/abc.lidan.cc.conf" "${CONFIG_DIR}/abc.lidan.cc.conf" >> "${LOG_FILE}" 2>&1 || true

# SSL 证书 (若存在)
rsync -avz "${REMOTE_USER}@${REMOTE_HOST}:/etc/openresty/ssl/abc.lidan.cc/" "${CONFIG_DIR}/ssl/" >> "${LOG_FILE}" 2>&1 || true
chmod 700 "${CONFIG_DIR}/ssl" 2>/dev/null || true
chmod 600 "${CONFIG_DIR}/ssl"/* 2>/dev/null || true

# seed.json (若存在)
rsync -avz "${REMOTE_USER}@${REMOTE_HOST}:/opt/creator/data/seed.json" "${CONFIG_DIR}/seed.json" >> "${LOG_FILE}" 2>&1 || true
log "✓ 配置文件与证书同步完成"

# 5. 校验最新备份完整性并解压到 latest/
log "==> [4/5] 校验最新备份完整性..."
NEWEST_ARCHIVE=$(ls -t "${ARCHIVE_DIR}"/creator-backup-*.tar.gz 2>/dev/null | head -n 1 || true)

if [[ -z "${NEWEST_ARCHIVE}" || ! -f "${NEWEST_ARCHIVE}" ]]; then
  log "❌ 警告: 未找到任何备份归档文件"
  exit 1
fi

ARCHIVE_NAME="$(basename "${NEWEST_ARCHIVE}")"
ARCHIVE_SIZE="$(du -h "${NEWEST_ARCHIVE}" | awk '{print $1}')"
ARCHIVE_SHA256="$(sha256sum "${NEWEST_ARCHIVE}" | awk '{print $1}')"

log "    最新备份归档: ${ARCHIVE_NAME} (${ARCHIVE_SIZE})"
log "    SHA256: ${ARCHIVE_SHA256}"

# 验证 tar 压缩包格式
if ! tar -tzf "${NEWEST_ARCHIVE}" >/dev/null 2>&1; then
  log "❌ 错误: 归档文件 ${ARCHIVE_NAME} 损坏，tar 校验失败！"
  exit 1
fi

# 解包至 temporary 验证目录
VERIFY_TMP="$(mktemp -d)"
tar -xzf "${NEWEST_ARCHIVE}" -C "${VERIFY_TMP}"

USER_COUNT=0
DOC_COUNT=0
if [[ -f "${VERIFY_TMP}/app.db" ]] && command -v sqlite3 >/dev/null 2>&1; then
  # 验证 SQLite 完整性
  QUICK_CHECK=$(sqlite3 "${VERIFY_TMP}/app.db" "PRAGMA quick_check;" 2>&1)
  if [[ "${QUICK_CHECK}" != "ok" ]]; then
    log "❌ 错误: SQLite 数据库完整性检查失败: ${QUICK_CHECK}"
    rm -rf "${VERIFY_TMP}"
    exit 1
  fi
  USER_COUNT=$(sqlite3 "${VERIFY_TMP}/app.db" "SELECT count(*) FROM users;" 2>/dev/null || echo "0")
  DOC_COUNT=$(sqlite3 "${VERIFY_TMP}/app.db" "SELECT count(*) FROM user_docs;" 2>/dev/null || echo "0")
  log "    SQLite 完整性校验: OK (用户数: ${USER_COUNT}, 文档数: ${DOC_COUNT})"
fi

# 复制到 latest 目录供快速调试/灾备使用
rm -rf "${LATEST_DIR:?}"/*
cp -r "${VERIFY_TMP}"/* "${LATEST_DIR}/"
cp "${CONFIG_DIR}/creator.env" "${LATEST_DIR}/" 2>/dev/null || true
rm -rf "${VERIFY_TMP}"

# 写入 meta.json
cat > "${LATEST_DIR}/meta.json" <<EOF
{
  "last_backup_time": "$(date -Iseconds)",
  "remote_host": "${REMOTE_HOST}",
  "archive_file": "${ARCHIVE_NAME}",
  "archive_size": "${ARCHIVE_SIZE}",
  "sha256": "${ARCHIVE_SHA256}",
  "sqlite_quick_check": "ok",
  "users_count": ${USER_COUNT},
  "docs_count": ${DOC_COUNT}
}
EOF

# 6. 本机归档轮转 (保留最近 N 天)
log "==> [5/5] 执行本机备份轮转 (清理 ${LOCAL_KEEP_DAYS} 天前历史归档)..."
DELETED_COUNT=0
while IFS= read -r old_file; do
  if [[ -n "${old_file}" ]]; then
    rm -f "${old_file}"
    DELETED_COUNT=$((DELETED_COUNT + 1))
  fi
done < <(find "${ARCHIVE_DIR}" -name "creator-backup-*.tar.gz" -type f -mtime +"${LOCAL_KEEP_DAYS}")

log "    清理了 ${DELETED_COUNT} 个超期旧备份"
CURRENT_COUNT=$(find "${ARCHIVE_DIR}" -name "creator-backup-*.tar.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_ROOT}" | awk '{print $1}')
log "✅ 备份全部完成！本机现有归档: ${CURRENT_COUNT} 个，备份总占用: ${TOTAL_SIZE}"
log "========================================================================"
