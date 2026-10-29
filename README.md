# 设定创作器 v6 (Worldbuilding Studio v6)

本地优先、支持多端云同步与创作大厅的设定集工作台（Vue 3.5 + TypeScript + Pinia + Go + SQLite WAL）。

---

## 核心特性

1. **本地优先与大容量存储**：
   - 采用 `IndexedDB`（`idb-keyval`）替代 5MB 上限的 `localStorage`，支持多标签页 `BroadcastChannel` 实时同步。
   - 自动无损迁移旧版 `cc_db_v5` / `ws_db` 及 v4/v5/v5.1/v5.3 备份文件至 `DocV6` 规范结构。
   - 100% 兼容旧版 `CC3W` / `CC2O` / `CC2` 草稿码导入与导出（通过 203 条 Golden Master 向量校验）。
2. **设定维基体验**：
   - **双向链接（Backlinks）**：自动扫描并展示引用了当前世界观/组织/角色的所有条目，一键跳转。
   - **维基式实体高亮（WikiText）**：纯 AST 分词渲染，点击文本中的实体名称即可跳转对应卡片，零 XSS 风险。
   - **改名联动更新**：修改世界观、组织或角色名称时，自动检测全库引用并提示一键同步替换。
   - **全局命令面板（`⌘K / Ctrl+K`）**：跨全库检索设定或执行快捷命令。
3. **零三方依赖账号与安全防护**：
   - 邮箱 + 密码（`bcrypt` cost 12）注册/登录，默认开放注册（`REGISTER_MODE=open`），支持切换邀请码模式（`invite`）或关闭注册（`closed`）。
   - 内置无状态 HMAC 算术验证码挑战、IP + 邮箱双桶限流、连续 5 次失败锁定 15 分钟、HttpOnly 会话 Cookie 与 Origin CSRF 校验。
4. **乐观锁云同步与智能合并**：
   - 剥离 `ui` 视图状态计算同步哈希，避免切换选中项触发假冲突。
   - 服务端 `rev` 乐观锁 + **实体/字段级三路自动合并（Three-Way Merge）**：不同实体或不同字段的并发修改自动无感合并；同一字段冲突提供逐字段可视化对比与抉择。
   - 服务端自动维护 `doc_revisions` 历史快照（10 分钟节流，保留最近 50 份 + 30 天每日快照），支持随时预览与一键回滚。
5. **旧版云端数据导出与导入工具**：
   - `bin/legacy-export`：交互式安全导出旧版 WorkBuddy 云端 `user_sync`、`user_presence`、`world_shares` 及签名头像。
   - `bin/creator legacy import`：一键将导出的旧版数据目录导入 v6 账号。

---

## 目录结构

```text
creator/
├── docs/
│   ├── DEPLOY.md             # 自建 VPS 部署、运维与域名/HTTPS 升级手册
│   ├── CLOUDFLARE.md         # 纯 Cloudflare Serverless 全家桶部署指南（方案三）
│   └── gemini/               # 重构任务包（00-RULES.md + T00~T14.md）
├── migrations/               # Cloudflare D1 数据库版本迁移 SQL (0001~0007)
├── worker/                   # Cloudflare Worker 全栈 API (Hono + TypeScript)
├── legacy/                   # v5.4 原始单文件参考实现（只读保留）
├── scripts/                  # 字典与 Golden Master 测试向量提取脚本
├── server/                   # Go 1.22+ 后端与 CLI（SQLite WAL 纯 Go 驱动，用于 VPS 部署）
├── web/                      # Vue 3.5 + TypeScript + Vite 6 + Pinia 前端
└── deploy/                   # systemd 服务、Nginx 配置、自动备份与一键部署脚本
```

---

## 快速开始与常用命令

### 1. 构建与测试

```bash
# 运行 Go 后端单测 + 前端 TypeScript 类型检查 + Vitest 单元测试
make test

# 构建前后端生产产物（输出至 bin/creator、bin/legacy-export、web/dist/）
make build

# 运行 Playwright E2E 冒烟测试
cd web && npx playwright test
```

### 2. 一键本地部署（systemd）

```bash
bash deploy/deploy.sh
```

服务默认监听 `http://0.0.0.0:8080`（可通过 `sudo systemctl status creator` 查看状态）。

### 3. 旧版云端数据拉取与导入

```bash
# 第一步：从旧版云端导出数据到本地目录（交互式输入手机号与密码，密码不回显）
./bin/legacy-export

# 第二步：将导出目录导入到新系统的指定邮箱账号
./bin/creator legacy import \
  --db /data/creator/var/creator.db \
  --avatar-dir /data/creator/var/avatars \
  --dir ./legacy-export-YYYYMMDD \
  --email your@email.com \
  --password 'YourPassword123'
```

### 4. 远程生产数据定时备份与灾备 (abc.lidan.cc)

系统已支持从远端生产环境在线热备份至本机，并提供定时自动化同步机制：

```bash
# 手动触发远端在线热备份 (SQLite VACUUM INTO + 头像打包) 并拉取到本机
make backup-remote

# 查看本机备份归档列表、大小、时间及 systemd 定时器运行状态
make backup-status

# 查看最新备份归档的数据库表统计（用户数、文档数、历史版本等）与校验和
make backup-info

# 灾备恢复工具（支持恢复到本地开发环境测试或应急恢复到远端）
./scripts/restore-from-backup.sh --to-local
```

自动化定时任务位于 `~/.config/systemd/user/creator-backup.timer`（参考模板位于 `deploy/systemd/`），每日凌晨 03:30 自动执行并保证开机补跑。


Cloudflare 本次升级的权限、提示词、配额配置、迁移预检及验证流程见 [创作管理与 AI 防滥用升级说明](docs/CLOUDFLARE_CREATOR_UPGRADE.md)。
