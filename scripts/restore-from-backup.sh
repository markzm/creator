#!/usr/bin/env bash
# ==============================================================================
# 设定创作器 (Creator Studio v6) —— 备份恢复与检查工具
#
# 支持:
# 1. 查看本地所有已备份归档及状态 (--list)
# 2. 检查特定归档详情 (表统计、用户数、头像数) (--info <archive>)
# 3. 恢复归档到本机开发环境 (/data/creator/data/) (--to-local [archive])
# 4. 应急恢复归档到远端生产环境 (abc.lidan.cc) (--to-remote [archive])
# ==============================================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE_DIR="${PROJECT_ROOT}/backups/abc.lidan.cc/archives"
REMOTE_HOST="${REMOTE_HOST:-abc.lidan.cc}"

usage() {
  cat <<EOF
用法:
  $0 --list                     列出本机所有可用备份归档
  $0 --info [归档名或路径]       查看备份详细统计信息 (默认查看最新)
  $0 --to-local [归档名或路径]   将备份恢复到本机开发环境 (/data/creator/data)
  $0 --to-remote [归档名或路径]  [慎用] 应急恢复备份至远端服务器 (${REMOTE_HOST})

示例:
  $0 --list
  $0 --info creator-backup-20261027-005956.tar.gz
  $0 --to-local
EOF
  exit 0
}

resolve_archive() {
  local target="${1:-}"
  if [[ -z "${target}" ]]; then
    target="$(ls -t "${ARCHIVE_DIR}"/creator-backup-*.tar.gz 2>/dev/null | head -n 1 || true)"
  elif [[ ! -f "${target}" && -f "${ARCHIVE_DIR}/${target}" ]]; then
    target="${ARCHIVE_DIR}/${target}"
  fi

  if [[ -z "${target}" || ! -f "${target}" ]]; then
    echo "❌ 错误: 找不到备份文件: ${target}" >&2
    exit 1
  fi
  echo "${target}"
}

cmd_list() {
  echo "========================================================================"
  echo "可用备份归档列表 (${ARCHIVE_DIR}):"
  echo "------------------------------------------------------------------------"
  printf "%-35s %-10s %-20s\n" "文件名" "大小" "修改时间"
  echo "------------------------------------------------------------------------"
  local count=0
  for f in $(ls -t "${ARCHIVE_DIR}"/creator-backup-*.tar.gz 2>/dev/null || true); do
    local fname="$(basename "${f}")"
    local fsize="$(du -h "${f}" | awk '{print $1}')"
    local ftime="$(date -r "${f}" '+%Y-%m-%d %H:%M:%S')"
    printf "%-35s %-10s %-20s\n" "${fname}" "${fsize}" "${ftime}"
    count=$((count + 1))
  done
  if [[ ${count} -eq 0 ]]; then
    echo "（暂无归档，请先执行 ./scripts/backup-remote.sh 同步）"
  fi
  echo "========================================================================"
}

cmd_info() {
  local arc="$(resolve_archive "${1:-}")"
  echo "========================================================================"
  echo "备份包详情分析: $(basename "${arc}")"
  echo "路径: ${arc}"
  echo "大小: $(du -h "${arc}" | awk '{print $1}')"
  echo "SHA256: $(sha256sum "${arc}" | awk '{print $1}')"
  echo "------------------------------------------------------------------------"
  
  local tmpdir="$(mktemp -d)"
  tar -xzf "${arc}" -C "${tmpdir}"
  
  if [[ -f "${tmpdir}/app.db" ]] && command -v sqlite3 >/dev/null 2>&1; then
    local quick_check="$(sqlite3 "${tmpdir}/app.db" 'PRAGMA quick_check;')"
    echo "SQLite 数据库完整性: ${quick_check}"
    echo "数据表行数统计:"
    sqlite3 "${tmpdir}/app.db" "
      SELECT '  - 用户数 (users):', count(*) FROM users
      UNION ALL
      SELECT '  - 文档数 (user_docs):', count(*) FROM user_docs
      UNION ALL
      SELECT '  - 历史版本 (doc_revisions):', count(*) FROM doc_revisions
      UNION ALL
      SELECT '  - 共创项目 (cocreation_projects):', count(*) FROM cocreation_projects
      UNION ALL
      SELECT '  - 邀请码 (invites):', count(*) FROM invites;
    "
  fi

  local avatar_count=0
  if [[ -d "${tmpdir}/avatars" ]]; then
    avatar_count="$(find "${tmpdir}/avatars" -type f | wc -l)"
  fi
  echo "头像文件总数: ${avatar_count} 个"
  
  rm -rf "${tmpdir}"
  echo "========================================================================"
}

cmd_to_local() {
  local arc="$(resolve_archive "${1:-}")"
  echo "⚠️  注意: 即将解压备份 [$(basename "${arc}")] 到本机环境 (/data/creator/data/)"
  read -r -p "确认覆盖本机当前数据？[y/N]: " confirm
  if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
    echo "操作已取消。"
    exit 0
  fi

  local target_data="${PROJECT_ROOT}/data"
  mkdir -p "${target_data}/avatars" "${target_data}/backups"

  # 备份本机当前 db
  if [[ -f "${target_data}/app.db" ]]; then
    cp "${target_data}/app.db" "${target_data}/app.db.bak_$(date +%s)"
  fi

  tar -xzf "${arc}" -C "${target_data}"
  echo "✅ 本机数据恢复成功！"
  echo "   数据库: ${target_data}/app.db"
  echo "   头像目录: ${target_data}/avatars"
}

cmd_to_remote() {
  local arc="$(resolve_archive "${1:-}")"
  echo "🚨 危险操作: 即将把备份 [$(basename "${arc}")] 恢复至远端服务器 [${REMOTE_HOST}]"
  echo "   这将覆盖远端生产环境当前的数据库与头像数据！"
  read -r -p "请输入 'RESTORE_PRODUCTION' 以继续: " confirm
  if [[ "${confirm}" != "RESTORE_PRODUCTION" ]]; then
    echo "确认文本不匹配，恢复终止。"
    exit 1
  fi

  echo "==> [1/4] 在远端执行停机前热备份..."
  ssh "root@${REMOTE_HOST}" "/opt/creator/deploy/backup.sh || true"

  echo "==> [2/4] 停止远端 creator 服务..."
  ssh "root@${REMOTE_HOST}" "systemctl stop creator"

  echo "==> [3/4] 上传并解压归档到远端 /opt/creator/data/..."
  scp "${arc}" "root@${REMOTE_HOST}:/tmp/restore.tar.gz"
  ssh "root@${REMOTE_HOST}" "
    cd /opt/creator/data
    tar -xzf /tmp/restore.tar.gz -C /opt/creator/data/
    rm -f /tmp/restore.tar.gz
    rm -f /opt/creator/data/app.db-shm /opt/creator/data/app.db-wal
  "

  echo "==> [4/4] 重启远端 creator 服务..."
  ssh "root@${REMOTE_HOST}" "systemctl start creator"
  ssh "root@${REMOTE_HOST}" "systemctl status creator --no-pager"
  echo "✅ 远端生产环境恢复完成！"
}

case "${1:-}" in
  --list)
    cmd_list
    ;;
  --info)
    cmd_info "${2:-}"
    ;;
  --to-local)
    cmd_to_local "${2:-}"
    ;;
  --to-remote)
    cmd_to_remote "${2:-}"
    ;;
  -h|--help)
    usage
    ;;
  *)
    cmd_list
    echo ""
    cmd_info ""
    ;;
esac
