# 视频生成系统 Docker 部署手册

> 目标：将 `video_format_demo` 项目以 Docker 方式部署至联网服务器，并满足生产环境的可维护性与可观测性需求。  
> 最后更新：2026-02-06

---

## 1. 部署范围与整体流程

1. 准备服务器（CPU/内存/磁盘/网络/防火墙）。
2. 安装 Docker、Docker Compose、Git，并创建部署目录。
3. 克隆代码、填写 `.env` 与 `config.toml`（当前暂不部署 SSL 证书）。
4. 使用 `docker compose` 构建镜像并启动（可选启用 `with-nginx` profile 提供 HTTPS）。
5. 通过健康检查、日志与验证接口确认服务可用。
6. 配置备份、升级与日常运维流程。

---

## 2. 架构与服务说明

| 服务 | 容器名 | 端口（默认） | 主要镜像 | 说明 |
|------|--------|--------------|----------|------|
| Backend API | `video-backend` | 3001 | Node 24 + ffmpeg/chromium | 负责任务编排、Remotion 渲染、与各类第三方 API 交互。挂载 `config.toml`、`data/`、`assets/`、`outputs/`、`logs/`。|
| Frontend | `video-frontend` | 80 | 自定义构建的 nginx:alpine | Vite/React 静态资源，内置反向代理 `/api` 指向 backend。|
| Nginx（可选） | `video-nginx` | 8080 / 8443 | 官方 nginx:alpine | 仅在未来需要 HTTPS/TLS 时启用，当前部署（纯 HTTP）可忽略此服务。|

所有容器加入 `video-network` 桥接网络，卷挂载实现数据持久化：

| 主机目录 | 容器目录 | 用途 |
|----------|----------|------|
| `./config.toml` | `/app/config.toml`（只读） | 后端主配置。|
| `./data` | `/app/data` | SQLite 数据库等持久数据。|
| `./assets` | `/app/assets` | 素材与生成的图片。|
| `./outputs` | `/app/outputs` | 渲染产物。|
| `./logs` | `/app/logs` | 应用日志。|
| `./nginx/ssl` | `/etc/nginx/ssl`（只读） | 仅在未来开启 HTTPS 时挂载证书，可暂不创建。|

---

## 3. 服务器与软件前提

- **操作系统**：Linux x86_64，推荐 Ubuntu 22.04 LTS / Debian 12 / CentOS 8 Stream / Rocky 8+。
- **硬件**：4 vCPU、8 GB RAM、50 GB 可用 SSD（视频渲染建议 ≥100 GB）。
- **网络**：放通 TCP 22（SSH）、80（HTTP 入口）、3001（若直接暴露 API）；如后续启用内置 Nginx 或 HTTPS，再开放 8080/8443/443。
- **系统时间**：开启 NTP，保证证书与第三方 API 鉴权准确。

### 3.1 安装 Docker 与依赖

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git

# CentOS / Rocky
sudo dnf install -y docker docker-compose git

sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # 可选：允许当前用户免 sudo 运行 docker
```

验证：
```bash
docker --version
docker compose version   # docker compose v2 推荐写法
```

> 如服务器仍使用 `docker-compose` v1，可把文档中 `docker compose` 替换为 `docker-compose`。

#### CentOS 7.9 特别说明

- CentOS 7 官方在 2024-06-30 EOL，建议尽快迁移到 Rocky / AlmaLinux 8+；若当前只能使用 7.9，可参照下列命令：
  ```bash
  sudo yum update -y
  sudo yum install -y yum-utils device-mapper-persistent-data lvm2 git
  sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo systemctl enable --now docker
  sudo usermod -aG docker $USER
  ```
- 若 `docker compose` 插件不可用，可使用 pip 安装 v1 工具：
  ```bash
  sudo yum install -y python3-pip
  sudo pip3 install docker-compose
  ```
- 由于 CentOS 7 默认内核较旧，如遇 cgroup v2 相关问题，可保持现状（v1），但务必在规划阶段评估升级计划。

---

## 4. 获取代码与准备配置

```bash
cd /opt        # 自行选择部署目录
git clone -b feature/video-optimization https://github.com/wuzhifeibuhuifei/video_format_demo.git
cd video_format_demo

cp .env.example .env
cp config.toml config.toml.bak.$(date +%Y%m%d)  # 首次部署可选备份
```

### 4.1 `.env` 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BACKEND_PORT` | `3001` | 后端容器映射到宿主的端口。若外层 Nginx 反代，可仅绑定到 `127.0.0.1`. |
| `FRONTEND_PORT` | `80` | 前端对外映射端口（容器内部监听 8080）。 |
| `NGINX_HTTP_PORT` / `NGINX_HTTPS_PORT` | `8080` / `8443` | 仅在启用 `with-nginx` profile 时生效。 |
| `NODE_ENV` | `production` | 后端 Node 运行模式。 |
| 其他 API Key | 留空 | 如需以环境变量覆写 `config.toml` 中的敏感信息，可在此添加。 |

### 4.2 `config.toml` 核心项

- `[volcengine]`、`[volcengine_video]`、`[volcengine_image]`：填写火山引擎相关 API Key 与模型 endpoint。
- `[minimax_speech]`、`[aliyun_asr]`：各自平台的 `api_key`/`token`。
- `[auth]`：默认 Basic Auth 用户名 `admin`/密码 `video2024`，部署前务必修改。
- `[workflow]` 与 `[video_effects]`：控制默认分镜数、画幅、素材输出目录。
- `[database]`：SQLite 路径 `data/projects.db`，无需修改但需确保目录可写。

**安全建议：**
1. 不要将真实 API Key 提交回 Git；可以设置 `.env` 或者 `config.override.json`（`remotion-video/server/config.override.json`）挂载覆盖。
2. `config.toml` 中的 token 若与团队成员共享，建议通过密码管理器下发。

### 4.3 SSL 证书（暂未启用）

当前需求仅发布 HTTP 服务，因此此阶段不生成/部署任何 SSL 证书，也无需准备 `nginx/ssl` 目录或触发 `with-nginx` profile。后续若需要 HTTPS，再根据实际域名申请证书并挂载即可。

### 4.4 Linux 版 Chrome Headless Shell

Remotion v4 仍依赖旧版 Headless 接口，需使用 Chrome Headless Shell（老 headless）的 Linux 版可执行文件：

1. **下载并解压**
   ```bash
   cd /opt/video_format_demo/remotion-video/server/assets
   mkdir -p chrome-headless && cd chrome-headless
   curl -LO https://storage.googleapis.com/chrome-for-testing-public/119.0.6045.105/linux64/chrome-headless-shell-linux64.zip
   unzip chrome-headless-shell-linux64.zip
   rm chrome-headless-shell-linux64.zip
   ```
   解压后会得到 `chrome-headless-shell-linux64/chrome-headless-shell`。
2. **配置环境变量**
   - 在 `.env`（或 `.env.example`）中设置：
     ```
     CHROME_EXECUTABLE_PATH=/app/assets/chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell
     ```
   - `docker-compose.yml` 已将 `remotion-video/server/assets/chrome-headless` 映射到容器的 `/app/assets/chrome-headless`，并读取上述变量。
3. **重建后端**
   ```bash
   docker compose build backend
   docker compose up -d backend
   ```
   日志应显示 `CHROME_EXECUTABLE_PATH=/app/assets/chrome-headless/...`，渲染时不再尝试下载 Chromium。

---

## 5. 项目目录速览

```
video_format_demo/
├── docker-compose.yml
├── .env / .env.example
├── config.toml
├── remotion-video/server/        # Backend 源码与 Dockerfile
├── frontend/                     # 前端源码与 Dockerfile
├── nginx/                        # 外层 Nginx 配置与证书
├── assets/                       # 静态素材
├── data/                         # SQLite、缓存等
├── outputs/                      # 渲染结果
├── logs/                         # 运行日志
└── docs/DOCKER_DEPLOY_ZH.md      # 本手册
```

首次部署前请创建并赋权持久目录：
```bash
mkdir -p data assets outputs logs
sudo chown -R $USER:$USER data assets outputs logs
```

> 若未来启用 HTTPS，再额外创建 `nginx/ssl` 并赋权。

---

## 6. Docker Compose 关键配置

```yaml
services:
  backend:
    build: ./remotion-video/server
    ports: ["${BACKEND_PORT:-3001}:3001"]
    volumes:
      - ./config.toml:/app/config.toml:ro
      - ./data:/app/data
      - ./assets:/app/assets
      - ./outputs:/app/outputs
      - ./logs:/app/logs
      - ./remotion-video/server/config.override.json:/app/remotion-video/server/config.override.json:ro
    healthcheck: GET http://localhost:3001/api/config

  frontend:
    build: ./frontend
    ports: ["${FRONTEND_PORT:-80}:8080"]
    depends_on: backend (service_healthy)
    healthcheck: wget http://localhost/

  # （可选）后续启用 HTTPS 时再启动
  nginx:
    image: nginx:alpine
    profiles: [with-nginx]
    ports:
      - "${NGINX_HTTP_PORT:-8080}:80"
      - "${NGINX_HTTPS_PORT:-8443}:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro   # 仅 HTTPS 场景需要
```

要点：
1. `backend` 使用多阶段构建安装 `ffmpeg`、`chromium`，需要较长时间下载。
2. `frontend` 镜像内置自定义 `nginx.conf`，已将 `/api/` 代理到容器网络中的 backend。
3. `nginx` 服务默认不开启，仅在 `docker compose --profile with-nginx up -d` 时启动；当前未启用 SSL，可忽略。
4. Compose 文件声明了 `volumes` 键，但为了明确持久化，本项目使用绑定挂载（主机目录）。

---

## 7. 基础部署（HTTP）

```bash
docker compose pull        # 如需预拉官方依赖镜像
docker compose build       # 构建 backend / frontend 镜像
docker compose up -d       # 以前台 HTTP 方式运行

docker compose ps          # 查看容器状态
docker compose logs -f backend
docker compose logs -f frontend
```

功能验证：
```bash
# API 健康检查
curl http://SERVER_IP:3001/api/config

# Web 前端
open http://SERVER_IP:80     # macOS
# 或浏览器访问 http://SERVER_IP
```

若服务器有外层 Nginx/Traefik，可将 `BACKEND_PORT`/`FRONTEND_PORT` 改为 127.0.0.1 绑定，并在宿主代理层透出 80/443。

---

## 8. 生产部署注意事项（HTTP-only）

1. **DNS**：如需使用域名，直接将 A 记录指向服务器公网 IP；暂不配置 HTTPS 解析。
2. **防火墙**：开放 TCP 80（前端）与 3001（若需直接访问 API），其余 HTTPS 相关端口可保持关闭，避免无证书情况下的无效暴露。
3. **启动命令**：沿用第 7 章的 `docker compose build` + `docker compose up -d`，不带任何 profile。
4. **验证**：
   ```bash
   curl -I http://SERVER_IP
   curl -I http://SERVER_IP:3001/api/config
   ```
   可用 `--resolve your.domain.com:80:SERVER_IP` 手动校验域名解析。
5. **未来切换 HTTPS**：待证书与域名准备就绪后，再创建 `nginx/ssl/`、启用 `with-nginx` profile 并复用此前的 HTTP 配置。

> 若公司已有外部反向代理/网关，可将代理层接入 HTTP 后端，SSL 仍在外保护层上终止。

---

## 9. 运维常用操作

- **启动 / 停止 / 重启**
  ```bash
  docker compose up -d
  docker compose down
  docker compose restart backend frontend
  ```
- **查看日志**
  ```bash
  docker compose logs -f backend
  docker compose logs --tail=200 frontend
  ```
- **进入容器排查**
  ```bash
  docker compose exec backend sh
  docker compose exec frontend sh
  ```
- **资源监控**
  ```bash
  docker stats
  docker system df
  ```
- **备份（示例）**
  ```bash
  tar -czf backup-$(date +%Y%m%d).tar.gz data/ assets/ outputs/ config.toml
  cp data/projects.db data/projects.db.$(date +%Y%m%d).bak
  ```
- **升级流程**
  ```bash
  git pull
  docker compose down
  docker compose build --pull
  docker compose up -d
  docker image prune -f    # 清理旧镜像（可选）
  ```

建议将备份与日志上传到对象存储或异地服务器，避免单点故障。

---

## 10. 健康检查与监控建议

- **HTTP 探针**：
  - `GET http://SERVER_IP:3001/api/config`：返回 200 表示 backend 正常。
  - `GET http://SERVER_IP/`：前端健康。
- **Docker 自带 healthcheck**：`backend` 与 `frontend` 已定义检查脚本，`docker compose ps` 能看到 `healthy`。
- **日志采集**：可将 `logs/` 挂载到宿主 `/var/log/video-format-demo`，由 Filebeat/Fluentd 收集。
- **系统监控**：建议使用 `node_exporter` + `Prometheus` 或云厂商监控查看 CPU/内存/磁盘/带宽。

---

## 11. 常见问题与排查

| 问题 | 排查思路 |
|------|----------|
| 容器启动即退出 | `docker compose logs backend` 查看 Node 报错，重点关注 API Key 缺失、`config.toml` 语法、磁盘权限。 |
| 端口占用 | `sudo lsof -i:3001` 查找占用进程，修改 `.env` 中的端口或释放冲突进程。 |
| 无法写入 `data/` | 检查宿主目录权限，执行 `sudo chown -R $USER:$USER data assets outputs logs`。 |
| Chromium 下载失败 | 服务器无网络或被防火墙阻拦，切换国内镜像（见 Dockerfile）或提前构建镜像并推送到私有仓库。 |
| 转码/渲染性能低 | 提升 vCPU、开启 `docker compose up -d --scale backend=2`（需要额外调度逻辑）或使用 GPU 服务器并自定义 Dockerfile。 |
| Basic Auth 无效 | 确认 `[auth] enable = true`，且未被 `config.override.json` 覆盖；如走外层 Nginx，也需同步配置。 |

---

## 12. 自动化与最佳实践

1. **系统开机自启**：`sudo systemctl enable docker` + `docker compose up -d` 放入 `/etc/rc.local` 或使用 `systemd` 编排（创建 `docker-compose@video_format_demo.service`）。
2. **CI/CD**：将构建步骤（`docker compose build`、`docker compose push`）集成到 GitHub Actions/GitLab CI，服务器仅拉取镜像并 `docker compose pull && docker compose up -d`.
3. **配置分层**：敏感信息优先写入 `.env` 或 `config.override.json`，把 `config.toml` 视为模板。
4. **日志切割**：可在宿主上使用 `logrotate` 轮转 `logs/` 与 `docker` 日志，避免磁盘爆满。

---

如需进一步的自动化部署（Ansible、Terraform）或多机扩展，请在现有 Docker 化基础上再封装；本手册覆盖了单机上线所需的关键步骤。祝部署顺利。 🎬
