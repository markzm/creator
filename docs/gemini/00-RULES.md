# 设定创作器 v6 —— Gemini 任务包公共规约（00-RULES）

> **适用范围**：本规约对 `docs/gemini/T00.md` 至 `docs/gemini/T14.md` 所有任务卡强制生效。每次开启新的 Gemini 会话执行任务卡时，必须先读取本文件。

---

## 1. 核心原则与设计指导（灵活参考）

1. **原版单文件定位（参考与借鉴）**：
   - 原版 v5.4 代码位于 `/data/creator/legacy/index.html`（共 4169 行），主要作为功能、字段与体验的参考借鉴及字典提取源（非死板教条，可在重构中合理优化交互与体验，但尽量不要直接去修改原参考文件本身）。
2. **自主可控与外部资源策略**：
   - 账号、数据库同步与对象存储采用自建 Go + SQLite 实现，不绑定 Supabase、WorkBuddy、Firebase 等商业 BaaS。
   - **允许使用公共 CDN**（如字体、图标或必要的公共前端资源），前端依赖与实现方式在保持轻量高效的前提下可灵活选择。
3. **双语与视觉还原**：
   - UI 文案中文优先，完整保留中英双语切换能力（`zh` / `en`）。
   - 完整继承原版 CSS 变量体系（`--bg`, `--card`, `--ink`, `--ac`, `html.dark` 等，见 `legacy/index.html` L10-L12），保证浅色与暗色模式质感一致。
4. **安全第一（开放注册模式 `REGISTER_MODE=open` 默认防护）**：
   - 既然默认支持开放式注册（`open`），所有认证与写接口必须内置纵深防御：
     - **密码安全**：强制最小 8 位（含字母与数字），`bcrypt`（Cost ≥ 12）哈希存储。
     - **防暴力破解与防刷**：内存级双维度令牌桶限流（按 IP 限流 + 按 Email 账号限流）；连续失败 5 次触发账号冷却（10 分钟）；自带轻量无状态图形/算术验证码或 PoW 挑战接口防脚本批量注水。
     - **会话安全**：32 字节 CSPRNG 随机 Token，客户端通过 `HttpOnly; SameSite=Lax` Cookie 传输，服务端 `sessions` 表**仅存 Token 的 SHA-256 哈希**。
     - **CSRF 与 XSS 防护**：所有 `POST/PUT/PATCH/DELETE` 强制校验 `Origin` 头；前端严禁使用 `v-html` 渲染用户输入内容（Wiki 双向链接采用 AST Token 切分 + Vue 组件渲染）。

---

## 2. 目录结构约定

```text
/data/creator/
├── Makefile                    # 统一构建、测试、检查、打包入口
├── legacy/
│   └── index.html              # [只读] 原版 v5.4 (4169 行)
├── scripts/
│   └── extract-legacy.mjs      # T02: 从 legacy/index.html 提取字典与金标准测试向量
├── docs/
│   ├── DEPLOY.md               # T13: 生产环境与测试环境部署手册
│   └── gemini/                 # 任务包目录 (00-RULES.md, T00.md ~ T14.md)
├── server/                     # Go 后端工作区
│   ├── go.mod
│   ├── cmd/
│   │   ├── creator/main.go         # 主程序 (serve | invite | user | legacy import | backup)
│   │   └── legacy-export/main.go   # T01: 旧 WorkBuddy 云端数据导出工具
│   └── internal/
│       ├── config/
│       ├── store/                  # SQLite WAL 读写双连接池 + migrations/*.sql
│       ├── auth/                   # Session, Bcrypt, RateLimiter, Captcha/PoW
│       ├── mail/                   # 可选 SMTP 发信
│       ├── legacy/                 # T12: 旧数据导入转换逻辑
│       └── api/                    # HTTP 路由与处理器
├── web/                        # Vue 3.5 + TypeScript 前端工作区
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── e2e/                    # T14: Playwright E2E 测试
│   └── src/
│       ├── core/               # 100% 纯 TS 逻辑，无 DOM/Vue 依赖，可独立单测
│       ├── data/               # IndexedDB (idb-keyval) + BroadcastChannel + Fetch API
│       ├── stores/             # Pinia 状态管理 (doc, sync, auth, ui)
│       ├── composables/        # 组合式函数
│       ├── components/         # base / editor / app 组件
│       ├── views/              # 路由页面视图
│       └── styles/             # tokens.css, base.css, utilities.css
└── deploy/                     # T13: nginx.conf, creator.service, backup.sh, deploy.sh
```

---

## 3. 工作流与验收准则

1. **按卡推进**：每次只执行一张任务卡（或明确可并行的前端/后端卡）。
2. **自测闭环**：代码编写完成后，必须运行当前卡片指定的 **「验证命令」** 以及全量回归命令 `make test`。测试未 100% 通过前不得标记完成。
3. **行为对齐原则**：遇到业务逻辑边界不确定时，以 `/data/creator/legacy/index.html` 中标注的行号实现为准；若做了向后兼容的增强，必须在任务完成说明中记录。
4. **Git 提交规范**：每完成并验证通过一张任务卡，执行一次 Git 提交，格式为：`T0x: <简明中文描述>`（例如 `T01: 实现旧云端数据导出工具 legacy-export 及单测`）。
