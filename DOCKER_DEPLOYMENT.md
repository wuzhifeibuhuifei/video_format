# Docker 部署指南

本文档介绍如何使用 Docker 部署视频生成系统。

---

## 目录

- [前置要求](#前置要求)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [部署步骤](#部署步骤)
- [常用命令](#常用命令)
- [生产环境部署](#生产环境部署)
- [故障排查](#故障排查)

---

## 前置要求

### 服务器要求

- **操作系统**: Linux (推荐 CentOS 8+, Ubuntu 20.04+, Rocky Linux 8+)
- **CPU**: 4 核心以上
- **内存**: 8GB 以上
- **磁盘**: 50GB 以上可用空间
- **网络**: 开放端口 80, 443, 3001

### 软件要求

在服务器上安装以下软件：

```bash
# CentOS/RHEL
sudo dnf install -y docker docker-compose git

# Ubuntu/Debian
sudo apt install -y docker.io docker-compose git

# 启动 Docker 服务
sudo systemctl start docker
sudo systemctl enable docker

# 添加当前用户到 docker 组（可选）
sudo usermod -aG docker $USER
```

验证安装：

```bash
docker --version
docker-compose --version
```

---

## 快速开始

### 1. 克隆项目代码

```bash
# 克隆仓库
git clone -b feature/video-optimization https://github.com/wuzhifeibuhuifei/video_format_demo.git
cd video_format_demo
```

### 2. 配置环境变量

复制并编辑环境变量文件：

```bash
cp .env.example .env
nano .env
```

配置示例：

```bash
# 后端端口
BACKEND_PORT=3001

# 前端端口
FRONTEND_PORT=80

# Nginx 端口（可选）
NGINX_HTTP_PORT=8080
NGINX_HTTPS_PORT=8443
```

### 3. 配置 API 密钥

编辑 `config.toml` 文件，填入您的 API 密钥：

```bash
nano config.toml
```

### 4. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 查看服务状态
docker-compose ps
```

### 5. 访问系统

- **前端**: http://YOUR_SERVER_IP
- **后端 API**: http://YOUR_SERVER_IP:3001/api/config

---

## 配置说明

### 目录结构

```
video_format_demo/
├── docker-compose.yml          # Docker Compose 配置
├── config.toml                 # 主配置文件
├── .env                        # 环境变量
├── remotion-video/
│   └── server/
│       ├── Dockerfile          # 后端 Dockerfile
│       └── .dockerignore       # Docker 忽略文件
├── frontend/
│   ├── Dockerfile              # 前端 Dockerfile
│   ├── nginx.conf              # 前端 Nginx 配置
│   └── .dockerignore
├── nginx/
│   ├── nginx.conf              # 反向代理配置
│   └── ssl/                    # SSL 证书目录
├── data/                       # 数据库目录（持久化）
├── assets/                     # 资源文件目录（持久化）
├── outputs/                    # 输出文件目录（持久化）
└── logs/                       # 日志目录（持久化）
```

### 数据持久化

以下目录通过 Docker 卷持久化：

| 目录 | 说明 | 容器内路径 |
|------|------|-----------|
| `./data` | SQLite 数据库 | `/app/data` |
| `./assets` | 图片/音频资源 | `/app/assets` |
| `./outputs` | 视频输出文件 | `/app/outputs` |
| `./logs` | 应用日志 | `/app/logs` |

---

## 部署步骤

### 基础部署（HTTP）

```bash
# 1. 拉取最新代码
git pull origin feature/video-optimization

# 2. 构建镜像
docker-compose build

# 3. 启动服务
docker-compose up -d

# 4. 查看状态
docker-compose ps
```

### 高级部署（HTTPS + 反向代理）

```bash
# 1. 生成自签名 SSL 证书（测试用）
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/private.key \
  -out nginx/ssl/certificate.crt

# 2. 启动带 Nginx 的服务
docker-compose --profile with-nginx up -d

# 3. 访问 https://YOUR_SERVER_IP:8443
```

### 使用 Let's Encrypt 证书（生产环境）

```bash
# 1. 安装 certbot
sudo apt install -y certbot  # Ubuntu/Debian
sudo dnf install -y certbot  # CentOS/RHEL

# 2. 获取证书（需要域名）
sudo certbot certonly --standalone -d yourdomain.com

# 3. 复制证书到项目目录
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/certificate.crt
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/private.key

# 4. 启动服务
docker-compose --profile with-nginx up -d
```

---

## 常用命令

### 服务管理

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 重启服务
docker-compose restart

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f [service_name]

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 容器管理

```bash
# 进入后端容器
docker-compose exec backend sh

# 进入前端容器
docker-compose exec frontend sh

# 查看容器资源使用
docker stats

# 清理未使用的镜像和卷
docker system prune -a
```

### 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建镜像
docker-compose build

# 重启服务
docker-compose up -d

# 清理旧镜像
docker image prune -f
```

### 备份与恢复

```bash
# 备份数据库
cp data/projects.db data/projects.db.backup.$(date +%Y%m%d)

# 备份所有数据
tar -czf backup-$(date +%Y%m%d).tar.gz data/ assets/ outputs/ config.toml

# 恢复数据库
cp data/projects.db.backup.YYYYMMDD data/projects.db
docker-compose restart backend
```

---

## 生产环境部署

### 使用外部 Nginx（推荐）

如果服务器已有 Nginx，可以使用以下配置：

```nginx
# /etc/nginx/conf.d/video-format-demo.conf

upstream video_backend {
    server 127.0.0.1:3001;
}

upstream video_frontend {
    server 127.0.0.1:8080;
}

server {
    listen 80;
    server_name yourdomain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # 前端
    location / {
        proxy_pass http://video_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://video_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

修改 `docker-compose.yml` 端口映射：

```yaml
services:
  backend:
    ports:
      - "127.0.0.1:3001:3001"  # 仅本地访问

  frontend:
    ports:
      - "127.0.0.1:8080:80"     # 仅本地访问
```

### 安全建议

1. **限制端口访问**: 使用防火墙限制访问
2. **定期更新**: 定期更新 Docker 镜像和依赖
3. **监控日志**: 定期检查日志文件
4. **备份数据**: 定期备份数据库和资源文件
5. **HTTPS**: 生产环境必须使用 HTTPS

---

## 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker-compose logs [service_name]

# 检查容器状态
docker-compose ps

# 进入容器检查
docker-compose exec backend sh
```

### 端口冲突

如果端口被占用，修改 `.env` 文件中的端口配置：

```bash
BACKEND_PORT=3002
FRONTEND_PORT=8080
```

### 权限问题

```bash
# 修改数据目录权限
sudo chown -R $USER:$USER data/ assets/ outputs/ logs/
```

### 数据库问题

```bash
# 检查数据库文件
ls -lh data/projects.db

# 重启后端服务
docker-compose restart backend

# 查看数据库日志
docker-compose logs backend | grep -i database
```

### 网络问题

```bash
# 检查 Docker 网络
docker network ls
docker network inspect video_format_demo_video-network

# 重建网络
docker-compose down
docker network prune
docker-compose up -d
```

### 性能问题

```bash
# 查看容器资源使用
docker stats

# 限制容器资源（在 docker-compose.yml 中添加）
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

---

## 常见问题

**Q: Docker 镜像构建失败怎么办？**

A: 检查网络连接，尝试使用国内镜像源：

```bash
# 编辑 /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://registry.docker-cn.com"
  ]
}

# 重启 Docker
sudo systemctl restart docker
```

**Q: 如何查看容器内日志？**

A: 使用以下命令：

```bash
# 实时查看所有日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend

# 查看最近 100 行日志
docker-compose logs --tail=100 backend
```

**Q: 如何更新到最新版本？**

A: 使用以下命令：

```bash
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 支持

如有问题，请查看：

- 项目 GitHub Issues
- 日志文件: `./logs/`
- Docker 日志: `docker-compose logs`

---

**文档版本**: 1.0
**最后更新**: 2025-02-04
