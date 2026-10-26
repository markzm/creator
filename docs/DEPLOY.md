# 设定创作器 v6 —— 部署与运维手册 (`DEPLOY.md`)

本手册涵盖 **当前机器（Ubuntu 22.04 LTS）无域名 IP 环境一键部署**、**旧云端数据导出与导入**、**日常用户/邀请码管理 CLI** 以及 **后期绑定域名升级 HTTPS + Nginx** 的完整步骤。

---

## 1. 当前测试/生产环境一键启动（无域名 IP 访问）

当前机器已通过 `deploy/deploy.sh` 配置好 `systemd` 守护服务（`creator.service`）：
- **监听地址**：`http://0.0.0.0:8080`（本机 `http://127.0.0.1:8080`，内网 `http://10.0.0.120:8080`）
- **超级管理员**：`SUPER_ADMIN_EMAIL=you@example.com`（该账号注册后服务启动时自动提升；或执行 `./bin/creator user promote --email you@example.com --super`）。管理员身份不再与任何昵称绑定。
- **密钥**：`SECRET_KEY` 必须固定（`openssl rand -hex 32`）；未设置时服务会在 `DATA_DIR/secret.key` 生成并持久化一份，用于验证码签名与用户 AI Key 加密。
- **可信代理**：`TRUSTED_PROXIES=127.0.0.0/8,::1/128`，只有来自这些地址的 `X-Forwarded-For` 才会被采信（限流/审计）。
- **外部链接**：`PUBLIC_URL=https://your.domain`，用于密码重置邮件中的 `/reset?token=` 链接。
- **AI 接口白名单**：用户自定义 AI 地址只允许 https 访问 `api.deepseek.com / api.siliconflow.cn / openrouter.ai / api.openai.com`，可用 `ALLOWED_AI_HOSTS` 追加域名；AI 接口需登录并按用户限流。
- **注册模式**：`REGISTER_MODE=open`（开放式注册，内置算术验证码挑战、8位字母+数字密码强度校验、IP 与账号双维防爆破限流）
- **数据存储路径**：
  - SQLite WAL 数据库：`/data/creator/data/app.db`
  - 用户头像目录：`/data/creator/data/avatars/`
  - 自动备份目录：`/data/creator/data/backups/`

### 常用服务管理命令
```bash
# 查看运行状态与实时日志
sudo systemctl status creator
sudo journalctl -u creator -f

# 重新编译并重启服务
cd /data/creator
./deploy/deploy.sh
```

---

## 2. 旧 WorkBuddy 云端数据导出与导入（T01 & T12）

### 第一步：从旧云端导出数据（只读，密码不回显、不落盘）
```bash
cd /data/creator
./bin/legacy-export --out ./legacy-export-data
```
终端会提示输入 11 位手机号和旧密码，自动拉取 `user_sync`、`user_presence`、`world_shares` 及签名头像，并生成兼容旧版与新版的 `./legacy-export-data/db.json`。

### 第二步：一键导入到新系统账号
```bash
cd /data/creator
./bin/creator legacy import \
  --dir ./legacy-export-data \
  --email your-email@example.com \
  --password YourNewPassword123
```
如果该邮箱尚未注册，会自动创建账号、恢复昵称/简介/头像、将设定集升级为 `DocV6` 入库并生成初始历史快照，同时恢复全部历史分享。

---

## 3. 管理员运维 CLI 工具箱

```bash
cd /data/creator

# 1. 查看所有注册用户
./bin/creator user list

# 2. 手动创建用户
./bin/creator user create --email user@example.com --password UserPass123

# 3. 为忘记密码的用户重置密码
./bin/creator user reset-password --email user@example.com --password NewPass123

# 4. 禁用 / 启用恶意账号
./bin/creator user disable --email spammer@example.com
./bin/creator user enable --email spammer@example.com

# 5. 生成邀请码（若将 REGISTER_MODE 切换为 invite）
./bin/creator invite create -n 10 -u 1

# 6. 立即执行一次不停机 SQLite 在线热备份 (VACUUM INTO + 头像打包)
./bin/creator backup --out /data/creator/data/backups --keep-days 14
```

---

## 4. 后期绑定域名与开启 Nginx + HTTPS 指南

当后期准备好域名（例如 `creator.example.com`）并解析到本服务器公网 IP 后：

1. **安装 Nginx 与 Certbot**：
   ```bash
   sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
   ```
2. **启用 Nginx 站点配置**：
   ```bash
   sudo mkdir -p /var/www/creator /var/lib/creator/avatars
   sudo cp -r /data/creator/web/dist/* /var/www/creator/
   sudo cp /data/creator/deploy/nginx.conf /etc/nginx/sites-available/creator.conf
   # 修改 server_name 为你的域名
   sudo sed -i 's/server_name _;/server_name creator.example.com;/' /etc/nginx/sites-available/creator.conf
   sudo ln -sf /etc/nginx/sites-available/creator.conf /etc/nginx/sites-enabled/creator.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. **一键申请并配置 Let's Encrypt HTTPS 证书**：
   ```bash
   sudo certbot --nginx -d creator.example.com
   ```
4. **开启 Secure Cookie**：
   编辑 `/data/creator/deploy/creator.env`，将 `SECURE_COOKIE=false` 改为 `SECURE_COOKIE=true`，然后执行 `sudo systemctl restart creator`。
