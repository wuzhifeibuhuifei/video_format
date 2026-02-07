# 宝塔面板部署指南

本文档详细介绍如何在宝塔面板上部署视频生成系统。

---

## 目录

- [宝塔面板介绍](#宝塔面板介绍)
- [安装宝塔面板](#安装宝塔面板)
- [安装 Docker](#安装-docker)
- [部署项目](#部署项目)
- [配置网站](#配置网站)
- [配置 SSL 证书](#配置-ssl-证书)
- [常用管理操作](#常用管理操作)
- [故障排查](#故障排查)

---

## 宝塔面板介绍

宝塔面板是一款服务器管理软件，支持：
- **可视化界面管理**：无需命令行操作
- **一键安装环境**：Nginx、PHP、MySQL、Docker 等
- **网站管理**：创建网站、配置域名
- **SSL 证书**：一键申请 Let's Encrypt 证书
- **文件管理**：在线编辑、上传文件
- **安全管理**：防火墙、端口管理

---

## 安装宝塔面板

### 1. 使用 SSH 连接服务器

```bash
ssh root@YOUR_SERVER_IP
```

### 2. 安装宝塔面板

**CentOS 8.2 安装命令：**

```bash
yum install -y wget && wget -O install.sh http://download.bt.cn/install/install_6.0.sh && sh install.sh
```

**其他系统安装命令：**

| 系统 | 安装命令 |
|------|----------|
| Ubuntu/Debian | `wget -O install.sh http://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh` |
| Fedora | `wget -O install.sh http://download.bt.cn/install/install_6.0.sh && bash install.sh` |

### 3. 记录登录信息

安装完成后会显示以下信息：

```
==================================================================
Congratulations! Installed successfully!
==================================================================
Bt-Panel: http://YOUR_SERVER_IP:8888/xxxxxxxx
username: xxxxxxxx
password: xxxxxxxx
==================================================================
```

**⚠️ 重要：请保存以上登录信息！**

### 4. 登录宝塔面板

1. 在浏览器访问：`http://YOUR_SERVER_IP:8888/xxxxxxxx`
2. 输入用户名和密码登录
3. 首次登录会提示安装 "LNMP" 或 "LAMP"，选择 **跳过**（我们只需要 Nginx）

### 5. 修改宝塔面板端口（安全建议）

1. 点击左侧 **面板设置**
2. 修改 **面板端口**（如：18888）
3. 在服务器防火墙开放新端口
4. 使用新端口重新登录

---

## 安装 Docker

### 方法一：通过宝塔 Docker 插件安装（推荐）

1. 登录宝塔面板
2. 点击左侧 **软件商店**
3. 搜索 **Docker**
4. 点击 **安装**
5. 等待安装完成

### 方法二：通过命令行安装

如果宝塔 Docker 插件不可用，使用命令行安装：

**CentOS 8.2 首先切换源：**

```bash
# 备份现有源
sudo mv /etc/yum.repos.d/CentOS-Base.repo /etc/yum.repos.d/CentOS-Base.repo.backup

# 使用 vault 源
sudo tee /etc/yum.repos.d/CentOS-Base.repo > /dev/null << 'EOF'
[BaseOS]
name=CentOS-8 - Base
baseurl=http://vault.centos.org/8.5.2111/BaseOS/x86_64/os/
gpgcheck=0
enabled=1

[AppStream]
name=CentOS-8 - AppStream
baseurl=http://vault.centos.org/8.5.2111/AppStream/x86_64/os/
gpgcheck=0
enabled=1
EOF

# 安装 Docker
sudo dnf clean all
sudo dnf makecache
sudo dnf install -y docker

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 验证安装
docker --version
```

---

## 部署项目

### 步骤 1: 打开宝塔终端

1. 点击左侧 **终端** 或 **Docker** -> **终端**
2. 进入命令行模式

### 步骤 2: 克隆项目代码

```bash
# 进入网站根目录（宝塔默认：/www/wwwroot）
cd /www/wwwroot

# 克隆项目
git clone -b feature/video-optimization https://github.com/wuzhifeibuhuifei/video_format_demo.git

# 进入项目目录
cd video_format_demo
```

### 步骤 3: 配置环境变量

在宝塔 **文件** 管理器中操作：

1. 点击左侧 **文件**
2. 进入 `/www/wwwroot/video_format_demo/`
3. 找到 `.env.example` 文件，**复制** 并重命名为 `.env`
4. **编辑** `.env` 文件（根据需要修改端口）

```bash
# .env 文件内容
BACKEND_PORT=3001
FRONTEND_PORT=8080
```

### 步骤 4: 配置 API 密钥

1. 在文件管理器中找到 `config.toml`
2. **编辑** 文件，填入您的 API 密钥

```toml
# 示例配置
[api]
volcengine_api_key = "your_volcengine_api_key_here"
minimax_api_key = "your_minimax_api_key_here"
```

### 步骤 5: 启动 Docker 容器

在宝塔 **终端** 中执行：

```bash
cd /www/wwwroot/video_format_demo

# 构建并启动服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 步骤 6: 验证部署

```bash
# 测试后端 API
curl http://localhost:3001/api/config

# 测试前端
curl http://localhost:8080/
```

---

## 配置网站

### 方案一：使用宝塔 Docker 代理（推荐）

1. 点击左侧 **网站**
2. 点击 **添加站点**
3. 填写信息：
   - **域名**：`yourdomain.com` 或 `YOUR_SERVER_IP`
   - **根目录**：随意选择（后续会删除）
   - **PHP 版本**：纯静态
4. 点击 **提交**

### 方案二：直接使用域名访问

如果已有域名，配置域名解析：

1. 在域名服务商添加 A 记录：
   ```
   类型: A
   主机记录: @
   记录值: YOUR_SERVER_IP
   TTL: 600
   ```

---

## 配置反向代理

### 使用宝塔面板配置反向代理

1. 在 **网站** 列表中找到刚创建的站点
2. 点击 **设置**
3. 点击左侧 **反向代理**
4. 点击 **添加反向代理**

**配置前端反向代理：**

| 选项 | 值 |
|------|-----|
| 代理名称 | frontend |
| 目标 URL | `http://127.0.0.1:8080` |
| 发送域名 | `$host` |

点击 **提交**

**配置 API 反向代理：**

1. 再次点击 **添加反向代理**
2. 配置如下：

| 选项 | 值 |
|------|-----|
| 代理名称 | api |
| 目标 URL | `http://127.0.0.1:3001` |
| 代理目录 | `/api` |
| 发送域名 | `$host` |

点击 **提交**

### 高级代理配置（可选）

如果需要自定义配置，点击 **配置文件**，添加以下内容：

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_connect_timeout 300s;
}
```

---

## 配置 SSL 证书

### 方法一：Let's Encrypt 免费证书（推荐）

1. 在网站设置中点击 **SSL**
2. 选择 **Let's Encrypt**
3. 填写邮箱地址
4. 勾选要申请证书的域名
5. 点击 **申请**
6. 等待证书申请完成

**申请条件：**
- 域名已解析到服务器
- 80 端口可访问
- 防火墙已开放 80 端口

### 方法二：上传自有证书

如果有购买的 SSL 证书：

1. 点击 **其他证书**
2. 填写证书内容：
   - **密钥(KEY)**：上传 `.key` 文件内容
   - **证书(PEM格式)**：上传 `.crt` 或 `.pem` 文件内容
3. 点击 **保存**
4. 开启 **强制 HTTPS**

### 验证 SSL

访问 `https://yourdomain.com`，检查：
- 地址栏显示 🔒 图标
- 无证书警告

---

## 常用管理操作

### Docker 容器管理

**在宝塔终端中执行：**

```bash
cd /www/wwwroot/video_format_demo

# 查看容器状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose stop

# 启动服务
docker-compose start

# 更新项目
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

### 使用宝塔 Docker 管理器

1. 点击左侧 **Docker**
2. 可以看到所有运行的容器
3. 支持以下操作：
   - 启动/停止容器
   - 查看容器日志
   - 进入容器终端
   - 查看容器资源使用

### 文件管理

**通过宝塔文件管理器：**

1. 点击左侧 **文件**
2. 进入项目目录 `/www/wwwroot/video_format_demo/`
3. 可以进行以下操作：
   - 在线编辑文件
   - 上传文件
   - 下载文件
   - 压缩/解压
   - 修改权限

### 定时任务

可以设置定时任务自动备份：

1. 点击左侧 **计划任务**
2. 点击 **添加任务**
3. 配置如下：

| 选项 | 值 |
|------|-----|
| 任务类型 | 备份网站 |
| 执行周期 | 每天 |
| 备份到 | 服务器磁盘 |

### 数据库备份

项目使用 SQLite 数据库，手动备份：

```bash
# 在宝塔终端中执行
cd /www/wwwroot/video_format_demo
cp data/projects.db data/projects.db.backup.$(date +%Y%m%d)
```

或使用宝塔计划任务自动备份：

1. 点击 **计划任务** -> **添加任务**
2. 任务类型：**Shell 脚本**
3. 执行周期：每天
4. 脚本内容：

```bash
cd /www/wwwroot/video_format_demo
cp data/projects.db data/projects.db.backup.$(date +\%Y\%m\%d)
find data/ -name "projects.db.backup.*" -mtime +30 -delete
```

---

## 防火墙配置

### 通过宝塔面板配置

1. 点击左侧 **安全**
2. 添加防火墙规则：

| 端口 | 协议 | 说明 |
|------|------|------|
| 80 | TCP | HTTP |
| 443 | TCP | HTTPS |
| 8888 | TCP | 宝塔面板 |
| 22 | TCP | SSH |

**注意：**
- 不要对外开放 3001、8080 端口（通过 Nginx 代理访问）
- 修改 SSH 端口提高安全性

### 通过命令行配置

```bash
# 开放端口
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=8888/tcp
sudo firewall-cmd --reload

# 查看已开放端口
sudo firewall-cmd --list-all
```

---

## 监控和日志

### 查看系统状态

1. 点击左侧 **监控**
2. 可以查看：
   - CPU 使用率
   - 内存使用率
   - 磁盘使用率
   - 网络流量

### 查看日志

**应用日志：**

```bash
# Docker 日志
docker-compose logs -f backend
docker-compose logs -f frontend

# Nginx 日志（通过宝塔）
# 1. 点击 网站 -> 站点设置 -> 日志
# 2. 选择 access.log 或 error.log
```

**系统日志：**

1. 点击左侧 **日志**
2. 选择日志类型查看

---

## 故障排查

### 问题 1: Docker 容器无法启动

**检查方法：**

1. 在宝塔 **Docker** 管理器查看容器状态
2. 点击 **日志** 查看错误信息

**常见原因：**

| 原因 | 解决方法 |
|------|----------|
| 端口被占用 | 修改 `.env` 文件中的端口配置 |
| 内存不足 | 在宝塔监控中查看内存使用情况 |
| 配置文件错误 | 检查 `config.toml` 语法 |

### 问题 2: 网站无法访问

**检查步骤：**

1. 检查容器是否运行：
   ```bash
   docker-compose ps
   ```

2. 检查反向代理配置：
   - 网站 -> 站点设置 -> 反向代理

3. 检查防火墙：
   - 安全 -> 防火墙

4. 检查域名解析：
   ```bash
   nslookup yourdomain.com
   ```

### 问题 3: SSL 证书申请失败

**常见原因：**

| 原因 | 解决方法 |
|------|----------|
| 域名未解析 | 确保域名 A 记录指向服务器 IP |
| 80 端口未开放 | 在防火墙中开放 80 端口 |
| 防火墙阻止 | 检查云服务商安全组 |

### 问题 4: API 请求失败

**检查方法：**

1. 测试后端服务：
   ```bash
   curl http://localhost:3001/api/config
   ```

2. 查看后端日志：
   ```bash
   docker-compose logs backend
   ```

3. 检查配置文件：
   - 确保 `config.toml` 中的 API 密钥正确

### 问题 5: 更新后功能异常

**回滚方法：**

```bash
cd /www/wwwroot/video_format_demo

# 查看最近提交
git log --oneline -10

# 回滚到指定版本
git reset --hard <commit_hash>

# 重启容器
docker-compose restart
```

---

## 性能优化

### 1. 限制容器资源

编辑 `docker-compose.yml`：

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### 2. 开启 Nginx 缓存

在网站反向代理设置中添加：

```nginx
# 静态文件缓存
location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
    proxy_pass http://127.0.0.1:8080;
    expires 7d;
    add_header Cache-Control "public, immutable";
}
```

### 3. 数据库优化

```bash
# 定期清理旧数据
cd /www/wwwroot/video_format_demo/data
sqlite3 projects.db "VACUUM;"
```

---

## 安全建议

1. **定期更新**：保持系统和 Docker 镜像最新
2. **强密码**：使用强密码并定期更换
3. **修改端口**：修改 SSH 和宝塔面板默认端口
4. **开启防火墙**：只开放必要端口
5. **定期备份**：设置自动备份任务
6. **监控日志**：定期检查访问和错误日志
7. **使用 HTTPS**：生产环境必须启用 SSL

---

## 常用命令速查

```bash
# 进入项目目录
cd /www/wwwroot/video_format_demo

# 服务管理
docker-compose up -d          # 启动服务
docker-compose down           # 停止服务
docker-compose restart        # 重启服务
docker-compose ps             # 查看状态
docker-compose logs -f        # 查看日志

# 更新项目
git pull                      # 拉取最新代码
docker-compose build          # 重新构建
docker-compose up -d          # 重启服务

# 数据库备份
cp data/projects.db data/projects.db.backup.$(date +%Y%m%d)

# 清理 Docker
docker system prune -f        # 清理未使用资源
```

---

## 联系支持

如遇到问题：
1. 查看 [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)
2. 查看项目 GitHub Issues
3. 检查宝塔日志：`/www/server/panel/logs/`

---

**文档版本**: 1.0
**最后更新**: 2025-02-04
**适用版本**: 宝塔面板 7.x+
