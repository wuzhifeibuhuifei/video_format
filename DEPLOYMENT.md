# 视频生成系统部署指南（CentOS 7.9）

本文档详细说明如何将 `video_format_demo` 项目从 GitHub 部署到 CentOS 7.9 云服务器。

> **注意**: 本文档专门针对 **CentOS 7.9** 系统编写。如果您使用其他系统，请参考其他部署文档。

## CentOS 7.9 特别说明

- CentOS 7.9 将于 **2024年6月30日** 停止维护（EOL），建议考虑迁移到 Rocky Linux 8 或 AlmaLinux 8
- 使用 `yum` 作为包管理器（不是 `dnf`）
- 使用 `systemd` 管理服务
- 防火墙使用 `firewalld` 或 `iptables`

## 目录

1. [服务器要求](#服务器要求)
2. [服务器环境准备](#服务器环境准备)
3. [代码部署](#代码部署)
4. [依赖安装](#依赖安装)
5. [配置文件](#配置文件)
6. [服务启动](#服务启动)
7. [进程管理 (PM2)](#进程管理-pm2)
8. [Nginx 反向代理](#nginx-反向代理)
9. [HTTPS 配置](#https-配置)
10. [防火墙配置](#防火墙配置)
11. [监控与日志](#监控与日志)
12. [故障排查](#故障排查)

---

## 服务器要求

### 最低配置
- **CPU**: 2 核心及以上
- **内存**: 4GB 及以上
- **硬盘**: 40GB 及以上 SSD
- **操作系统**: CentOS 7.9 / RHEL 7.9

### 推荐配置
- **CPU**: 4 核心及以上
- **内存**: 8GB 及以上
- **硬盘**: 80GB 及以上 SSD
- **操作系统**: CentOS 7.9 最小化安装

---

## 服务器环境准备

### 1. 更新系统

```bash
# CentOS 7.9
sudo yum update -y

# 安装 EPEL 仓库和基础工具
sudo yum install -y epel-release
sudo yum install -y wget curl vim unzip rsync
```

### 2. 安装 Node.js (推荐 v18+)

**CentOS 7.9 使用 NodeSource 仓库安装 Node.js 18.x：**

```bash
# 安装 Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node -v  # 应显示 v18.x.x
npm -v   # 应显示 9.x.x 或更高

# 如果需要更新 npm
npm install -g npm@latest
```

### 3. 安装 FFmpeg (视频处理必需)

**CentOS 7.9 需要从第三方仓库安装 FFmpeg：**

```bash
# 安装 Nux Dextop 仓库
sudo rpm -Uvh http://li.nux.ro/download/nux/dextop/el7/x86_64/nux-dextop-release-0-5.el7.nux.noarch.rpm

# 安装 FFmpeg
sudo yum install -y ffmpeg ffmpeg-devel

# 验证安装
ffmpeg -version
```

### 4. 安装 Chrome/Chromium (用于 Remotion 渲染)

```bash
# 方法一：安装 Chromium（推荐）
sudo yum install -y chromium

# 方法二：下载 Chrome Headless Shell
cd /tmp
wget https://storage.googleapis.com/chrome-for-testing/public/HEADS_LINUX_64 chrome-headless-shell-linux64.zip
sudo unzip -o chrome-headless-shell-linux64.zip -d /opt/
sudo chown -R root:root /opt/chrome-headless-shell-linux64

# 设置环境变量
echo 'export CHROME_EXECUTABLE_PATH=/opt/chrome-headless-shell-linux64/chrome-headless-shell-linux64/chrome-headless-shell' | sudo tee -a /etc/profile.d/chrome.sh
source /etc/profile.d/chrome.sh
```

### 5. 安装 Python 3

```bash
# CentOS 7.9 安装 Python 3
sudo yum install -y python36 python36-pip

# 创建 python3 软链接
sudo alternatives --install /usr/bin/python3 python3 /usr/bin/python36 1

# 验证安装
python3 --version  # 应显示 Python 3.6.x
pip3 --version
```

### 6. 安装 Git

```bash
sudo yum install -y git

# 验证安装
git --version
```

### 7. 安装 PM2 (进程管理)

```bash
sudo npm install -g pm2

# 验证安装
pm2 -v

# 设置 PM2 开机自启
pm2 startup systemd
# 执行输出的命令
```

### 8. 安装 Nginx (Web 服务器)

```bash
# 安装 Nginx
sudo yum install -y nginx

# 启动 Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 验证安装
nginx -v
```

---

## 代码部署

### 方式一：直接克隆代码

```bash
# 创建项目目录
sudo mkdir -p /opt/video-format-demo
cd /opt/video-format-demo

# 克隆代码
git clone https://github.com/wuzhifeibuhuifei/video_format_demo.git .

# 或指定分支
git clone -b feature/video-optimization https://github.com/wuzhifeibuhuifei/video_format_demo.git .
```

### 方式二：从 GitHub 拉取最新代码

```bash
cd /opt/video-format-demo
git pull origin feature/video-optimization
```

### 设置文件权限

```bash
# 创建专用用户运行服务
sudo useradd -m -s /bin/bash videogen

# 设置项目目录权限
sudo chown -R videogen:videogen /opt/video-format-demo
```

---

## 依赖安装

### 1. 后端依赖

```bash
cd /opt/video-format-demo/remotion-video/server
npm install
```

### 2. 前端构建

```bash
cd /opt/video-format-demo/frontend
npm install
npm run build
```

构建完成后，静态文件在 `frontend/dist` 目录。

---

## 配置文件

### 1. 编辑配置文件

```bash
cd /opt/video-format-demo
nano config.toml
```

### 2. 配置内容说明

```toml
[volcengine]
# 火山引擎 API 配置
api_url = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
api_key = "your-api-key-here"
model = "deepseek-v3-2-251201"

[video]
aspect_ratio = "16:9"

[timing]
base_duration = 3.0
min_duration = 2.0
max_duration = 8.0
transition_duration = 0.1

[video_effects]
enable_movement = true
zoom_ratio = 1.12
pan_x_range = 50
pan_y_range = 50
movement_type = "zoom_in"

[audio_effects]
enable_bgm = true
bgm_volume = 0.2
bgm_loop = true

[minimax_speech]
api_url = "https://api.minimaxi.com/v1/t2a_v2"
api_key = "your-minimax-api-key"
model = "speech-2.6-hd"

[minimax_speech.voice_setting]
voice_id = "Chinese (Mandarin)_Unrestrained_Young_Man"
speed = 1.1
vol = 1.0

[volcengine_video]
enable = true
api_key = "your-api-key-here"
model_endpoint = "doubao-seedance-1-0-pro-fast-251015"

[volcengine_image]
enable = true
api_key = "your-api-key-here"
model_endpoint = "doubao-seedream-4-5-251128"

[auth]
enable = true
username = "admin"
password = "your-secure-password-here"

[database]
path = "/opt/video-format-demo/data/projects.db"

[remotion]
enable = true
server_url = "http://127.0.0.1:3001"
fps = 24
```

### 3. 创建必要目录

```bash
mkdir -p /opt/video-format-demo/data
mkdir -p /opt/video-format-demo/assets/images/projects
mkdir -p /opt/video-format-demo/assets/audio/generated
mkdir -p /opt/video-format-demo/outputs

sudo chown -R videogen:videogen /opt/video-format-demo/data
sudo chown -R videogen:videogen /opt/video-format-demo/assets
sudo chown -R videogen:videogen /opt/video-format-demo/outputs
```

---

## 服务启动

### 1. 启动后端 API 服务

```bash
cd /opt/video-format-demo/remotion-video/server

# 使用 videogen 用户运行
sudo -u videogen npm start
```

后端服务默认运行在 `http://localhost:3001`

### 2. 使用 PM2 管理后端服务

创建 PM2 配置文件 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'video-api',
    script: '/opt/video-format-demo/remotion-video/server/server.js',
    cwd: '/opt/video-format-demo/remotion-video/server',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '/var/log/video-api/error.log',
    out_file: '/var/log/video-api/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false
  }]
};
```

启动服务：

```bash
# 创建日志目录
sudo mkdir -p /var/log/video-api
sudo chown videogen:videogen /var/log/video-api

# 启动服务
sudo -u videogen pm2 start ecosystem.config.js

# 保存 PM2 进程列表
sudo -u videogen pm2 save

# 设置开机自启（CentOS 7.9 使用 systemd）
pm2 startup systemd
# 执行输出的命令，类似：
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u videogen --hp /home/videogen
```

---

## Nginx 反向代理

### 1. 创建 Nginx 配置文件

**CentOS 7.9 Nginx 配置文件路径：**

```bash
sudo nano /etc/nginx/conf.d/video-format-demo.conf
```

### 2. Nginx 配置内容

```nginx
# HTTP 配置 (重定向到 HTTPS)
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或服务器IP

    # Let's Encrypt 验证路径
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # 其他请求重定向到 HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    server_name your-domain.com;  # 替换为你的域名或服务器IP

    # SSL 证书配置 (下面有详细说明)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 日志配置
    access_log /var/log/nginx/video-format-demo-access.log;
    error_log /var/log/nginx/video-format-demo-error.log;

    # 前端静态文件
    location / {
        root /opt/video-format-demo/frontend/dist;
        try_files $uri $uri/ /index.html;

        # 缓存配置
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # 代理头设置
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        # 缓冲设置
        proxy_buffering off;
    }

    # 文件上传大小限制
    client_max_body_size 100M;
}
```

### 3. 启用配置

```bash
# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

---

## HTTPS 配置

### 使用 Let's Encrypt 免费证书

#### 1. 安装 Certbot

**CentOS 7.9 安装 Certbot：**

```bash
# 安装 EPEL 仓库（如果未安装）
sudo yum install -y epel-release

# 安装 Certbot
sudo yum install -y certbot certbot-nginx

# 验证安装
certbot --version
```

#### 2. 获取证书

```bash
# 如果有域名
sudo certbot --nginx -d your-domain.com

# 如果有多个域名
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 如果只有 IP 地址，使用自签名证书（见下方）
```

#### 3. 自动续期

```bash
# 测试自动续期
sudo certbot renew --dry-run

# 设置自动续期 cron 任务
sudo crontab -e

# 添加以下行（每天凌晨 2 点检查并续期）
0 2 * * * /usr/bin/certbot renew --quiet && /usr/bin/systemctl reload nginx
```

### 自签名证书 (仅用于测试)

```bash
# 创建证书目录
sudo mkdir -p /etc/nginx/ssl

# 生成自签名证书
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/private.key \
  -out /etc/nginx/ssl/certificate.crt \
  -subj "/C=CN/ST=State/L=City/O=Organization/CN=localhost"

# 设置权限
sudo chmod 600 /etc/nginx/ssl/private.key
sudo chmod 644 /etc/nginx/ssl/certificate.crt

# 修改 Nginx 配置使用自签名证书
# 在 /etc/nginx/conf.d/video-format-demo.conf 中修改：
ssl_certificate /etc/nginx/ssl/certificate.crt;
ssl_certificate_key /etc/nginx/ssl/private.key;
```

---

## 防火墙配置

### CentOS 7.9 使用 firewalld

```bash
# 启动 firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld

# 开放 SSH
sudo firewall-cmd --permanent --add-service=ssh

# 开放 HTTP
sudo firewall-cmd --permanent --add-service=http

# 开放 HTTPS
sudo firewall-cmd --permanent --add-service=https

# 重载防火墙
sudo firewall-cmd --reload

# 查看状态
sudo firewall-cmd --list-all

# 如果需要开放后端端口（不推荐，建议用 Nginx 代理）
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

### 或使用 iptables（传统方式）

```bash
# 安装 iptables 服务
sudo yum install -y iptables-services

# 启动 iptables
sudo systemctl start iptables
sudo systemctl enable iptables

# 添加规则
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# 保存规则
sudo service iptables save
```

---

## 监控与日志

### 1. PM2 监控

```bash
# 查看进程状态
pm2 list

# 查看日志
pm2 logs video-api

# 实时监控
pm2 monit

# 重启服务
pm2 restart video-api

# 停止服务
pm2 stop video-api
```

### 2. Nginx 日志

```bash
# 访问日志
sudo tail -f /var/log/nginx/video-format-demo-access.log

# 错误日志
sudo tail -f /var/log/nginx/video-format-demo-error.log
```

### 3. 应用日志

```bash
# 后端日志
tail -f /var/log/video-api/out.log
tail -f /var/log/video-api/error.log
```

### 4. 系统资源监控

```bash
# CPU 和内存
htop

# 磁盘使用
df -h

# 端口监听
sudo netstat -tlnp | grep -E '(3001|80|443)'
```

---

## 故障排查

### 服务无法启动

```bash
# 1. 检查端口占用
sudo netstat -tlnp | grep 3001

# 2. 查看 PM2 日志
pm2 logs video-api --lines 100

# 3. 检查 Node.js 版本
node -v

# 4. 检查依赖是否完整
cd /opt/video-format-demo/remotion-video/server
npm ls
```

### API 请求失败

```bash
# 1. 检查后端服务状态
pm2 status

# 2. 检查 Nginx 配置
sudo nginx -t

# 3. 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 4. 测试后端直接访问
curl http://localhost:3001/api/config
```

### 视频生成失败

```bash
# 1. 检查 FFmpeg
ffmpeg -version

# 2. 检查 Chrome
which chromium-browser

# 3. 检查配置文件
cat /opt/video-format-demo/config.toml

# 4. 检查数据库权限
ls -la /opt/video-format-demo/data/
```

### 数据库错误

```bash
# 1. 检查数据库文件
ls -la /opt/video-format-demo/data/projects.db

# 2. 检查文件权限
sudo chown videogen:videogen /opt/video-format-demo/data/projects.db

# 3. 检查 better-sqlite3 是否安装
cd /opt/video-format-demo/remotion-video/server
npm ls | grep better-sqlite3
```

---

## 更新部署

### 1. 拉取最新代码

```bash
cd /opt/video-format-demo
git pull origin feature/video-optimization
```

### 2. 更新依赖

```bash
# 后端
cd /opt/video-format-demo/remotion-video/server
npm install

# 前端
cd /opt/video-format-demo/frontend
npm install
npm run build
```

### 3. 重启服务

```bash
# 重启后端
pm2 restart video-api

# 重载 Nginx
sudo systemctl reload nginx
```

---

## 安全建议

1. **定期更新系统**
   ```bash
   sudo yum update -y
   ```

2. **使用强密码**
   - 修改 `config.toml` 中的默认密码
   - 使用复杂密码（大小写字母+数字+特殊字符）

3. **限制 API 访问**
   - 配置防火墙规则
   - 使用 fail2ban 防止暴力破解
   ```bash
   # 安装 fail2ban
   sudo yum install -y fail2ban
   sudo systemctl start fail2ban
   sudo systemctl enable fail2ban
   ```

4. **定期备份**
   ```bash
   # 创建备份目录
   sudo mkdir -p /backup

   # 备份数据库
   sudo cp /opt/video-format-demo/data/projects.db /backup/projects.db.$(date +%Y%m%d)

   # 备份配置
   sudo cp /opt/video-format-demo/config.toml /backup/config.toml.$(date +%Y%m%d)

   # 设置自动备份（可选）
   sudo crontab -e
   # 添加：每天凌晨 3 点备份
   0 3 * * * /bin/cp /opt/video-format-demo/data/projects.db /backup/projects.db.$(date +\%Y\%m\%d)
   ```

5. **监控日志**
   - 定期检查访问日志
   - 关注异常错误和请求

---

## 常用命令速查

### PM2 进程管理

```bash
# 启动服务
pm2 start ecosystem.config.js

# 停止服务
pm2 stop video-api

# 重启服务
pm2 restart video-api

# 查看日志
pm2 logs video-api

# 查看状态
pm2 status

# 查看监控
pm2 monit
```

### Nginx 管理

```bash
# 重载 Nginx
sudo systemctl reload nginx

# 重启 Nginx
sudo systemctl restart nginx

# 测试 Nginx 配置
sudo nginx -t

# 查看 Nginx 状态
sudo systemctl status nginx

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/error.log
```

### 系统管理

```bash
# 查看系统负载
top

# 查看磁盘使用
df -h

# 查看内存使用
free -h

# 查看端口监听
sudo netstat -tlnp | grep -E '(3001|80|443)'

# 查看进程
ps aux | grep node

# 查看系统日志
sudo journalctl -f
```

---

## 联系支持

如有部署问题，请检查：
1. 服务器日志文件
2. PM2 日志
3. Nginx 错误日志
4. GitHub Issues: https://github.com/wuzhifeibuhuifei/video_format_demo/issues
