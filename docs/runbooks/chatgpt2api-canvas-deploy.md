# ChatGPT2API 服务器画布部署

本文档记录 `111.230.202.235` 上已有 `chatgpt2api` Docker Compose 项目中的 `infinite-canvas` 服务部署方式。

## 安全边界

- 只更新 `/opt/chatgpt2api/docker-compose.yml` 里的 `infinite-canvas` 服务。
- 只重建 `infinite-canvas:multi-channel` 镜像。
- 只执行 `docker compose up -d --no-deps --force-recreate infinite-canvas`。
- 不执行 `docker compose down`、`docker system prune`、全局重启 Docker 或重启其他服务。
- 数据目录保持 `/opt/chatgpt2api/data/infinite-canvas:/app/data`，脚本不会覆盖服务器 `.env`、`canvas.env` 或 SQLite 数据库。

## 本地执行

在仓库根目录执行：

```powershell
python scripts/deploy-chatgpt2api-canvas.py --password "服务器 SSH 密码"
```

也可以在自动化场景使用临时环境变量：

```powershell
$env:SSH_PASSWORD="服务器 SSH 密码"
python scripts/deploy-chatgpt2api-canvas.py
```

脚本默认参数：

```text
host=111.230.202.235
user=root
remote-root=/opt/chatgpt2api
service=infinite-canvas
image=infinite-canvas:multi-channel
container=chatgpt2api-prod-canvas
port=127.0.0.1:18082
build-timeout=1200
```

需要覆盖时使用参数或环境变量，例如：

```powershell
python scripts/deploy-chatgpt2api-canvas.py --build-timeout 1800
```

如果本次只改了 `web/` 前端代码，没有改 Go 后端，可以复用服务器现有镜像里的 Go server，只重建 Next.js 前端层：

```powershell
python scripts/deploy-chatgpt2api-canvas.py --frontend-only
```

也可以通过环境变量开启：

```powershell
$env:INFINITE_CANVAS_FRONTEND_ONLY="1"
python scripts/deploy-chatgpt2api-canvas.py
```

## 脚本流程

1. 本地打包当前仓库，排除 `.git`、`.env*`、`data/`、`node_modules/`、`.next/`、`*.tar` 等本地和构建产物。
2. 通过 SSH 上传到服务器 `/tmp/`。
3. 在服务器临时目录解包并执行 Docker 构建；默认使用 `Dockerfile` 全量构建，`--frontend-only` 时使用 `Dockerfile.web-only` 复用现有运行镜像并只替换前端产物。
4. 构建成功后进入 `/opt/chatgpt2api`，只重建并启动 `infinite-canvas` 服务。
5. 检查容器状态，并访问 `http://127.0.0.1:18082/` 做本机健康检查。
6. 成功后清理服务器临时包和临时构建目录。

## 失败处理

- 镜像构建失败或超时：脚本退出，不会切换线上容器。
- SSH 连接失败：确认密码变量、服务器地址和 root 登录权限。
- 远端构建卡住：可先确认进程，再只清理本次构建进程，不要影响运行中的 `chatgpt2api-prod-canvas` 容器。

```bash
pgrep -af "docker build.*infinite-canvas:multi-channel|go build -o /server"
pkill -f "docker build.*infinite-canvas:multi-channel"
pkill -f "go build -o /server"
```

清理前先确认进程命令包含本项目镜像名或 `/server` 构建目标。
