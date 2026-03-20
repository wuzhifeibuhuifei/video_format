#!/bin/bash
# ================================================
# 视频生成系统 - CentOS 8.2 自动部署脚本
# ================================================

set -e  # 遇到错误立即退出

echo "=========================================="
echo "  视频生成系统 - CentOS 8.2 自动部署"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目配置
PROJECT_DIR="/opt/video-format-demo"
PROJECT_REPO="https://github.com/wuzhifeibuhuifei/video_format_demo.git"
PROJECT_BRANCH="feature/video-optimization"
RUNNING_USER="videogen"
BACKEND_PORT=3001

# ============================================
# 1. 系统更新
# ============================================
echo -e "${GREEN}[1/10] 更新系统...${NC}"
sudo dnf update -y

# ============================================
# 2. 安装基础工具
# ============================================
echo -e "${GREEN}[2/10] 安装基础工具...${NC}"
sudo dnf install -y curl wget git vim unzip rsync

# ============================================
# 3. 安装 Node.js 24.x
# ============================================
echo -e "${GREEN}[3/10] 安装 Node.js 24.x...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
    sudo dnf install -y nodejs
    echo -e "${GREEN}Node.js 版本: $(node -v)${NC}"
    echo -e "${GREEN}npm 版本: $(npm -v)${NC}"
else
    echo -e "${YELLOW}Node.js 已安装，版本: $(node -v)${NC}"
fi

# ============================================
# 4. 安装 FFmpeg
# ============================================
echo -e "${GREEN}[4/10] 安装 FFmpeg...${NC}"
sudo dnf install -y epel-release
sudo dnf config-manager --set-enabled powertools 2>/dev/null || true
sudo dnf install -y ffmpeg
echo -e "${GREEN}FFmpeg 版本: $(ffmpeg -version | head -n1)${NC}"

# ============================================
# 5. 安装 Python 3
# ============================================
echo -e "${GREEN}[5/10] 安装 Python 3...${NC}"
sudo dnf install -y python3 python3-pip
echo -e "${GREEN}Python 版本: $(python3 --version)${NC}"

# ============================================
# 6. 安装 Chrome/Chromium
# ============================================
echo -e "${GREEN}[6/10] 安装 Chromium...${NC}"
sudo dnf install -y chromium || {
    echo -e "${YELLOW}从源码安装 Chrome Headless Shell...${NC}"
    cd /tmp
    wget -q https://storage.googleapis.com/chrome-for-testing-public/HEADS_LINUX_64 chrome-headless-shell-linux64.zip
    sudo unzip -o chrome-headless-shell-linux64.zip -d /opt/
    sudo chown -R root:root /opt/chrome-headless-shell-linux64
}

# ============================================
# 7. 安装 PM2
# ============================================
echo -e "${GREEN}[7/10] 安装 PM2...${NC}"
sudo npm install -g pm2
echo -e "${GREEN}PM2 版本: $(pm2 -v)${NC}"

# ============================================
# 8. 安装 Nginx
# ============================================
echo -e "${GREEN}[8/10] 安装 Nginx...${NC}"
sudo dnf install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
echo -e "${GREEN}Nginx 已启动${NC}"

# ============================================
# 9. 部署项目代码
# ============================================
echo -e "${GREEN}[9/10] 部署项目代码...${NC}"

# 创建运行用户
if ! id "$RUNNING_USER" &>/dev/null; then
    sudo useradd -m -s /bin/bash $RUNNING_USER
    echo -e "${GREEN}创建用户: $RUNNING_USER${NC}"
fi

# 创建项目目录
sudo mkdir -p $PROJECT_DIR

# 克隆代码
if [ -d "$PROJECT_DIR/.git" ]; then
    echo -e "${YELLOW}项目已存在，拉取最新代码...${NC}"
    cd $PROJECT_DIR
    sudo -u $RUNNING_USER git pull origin $PROJECT_BRANCH
else
    echo -e "${YELLOW}克隆项目代码...${NC}"
    sudo -u $RUNNING_USER git clone -b $PROJECT_BRANCH $PROJECT_REPO $PROJECT_DIR
fi

# 设置权限
sudo chown -R $RUNNING_USER:$RUNNING_USER $PROJECT_DIR

# 创建必要目录
sudo mkdir -p $PROJECT_DIR/data
sudo mkdir -p $PROJECT_DIR/assets/images/projects
sudo mkdir -p $PROJECT_DIR/assets/audio/generated
sudo mkdir -p $PROJECT_DIR/outputs
sudo chown -R $RUNNING_USER:$RUNNING_USER $PROJECT_DIR/data
sudo chown -R $RUNNING_USER:$RUNNING_USER $PROJECT_DIR/assets
sudo chown -R $RUNNING_USER:$RUNNING_USER $PROJECT_DIR/outputs

# 安装后端依赖
echo -e "${YELLOW}安装后端依赖...${NC}"
sudo -u $RUNNING_USER bash -c "cd $PROJECT_DIR/remotion-video/server && npm install"

# 构建前端
echo -e "${YELLOW}构建前端...${NC}"
sudo -u $RUNNING_USER bash -c "cd $PROJECT_DIR/frontend && npm install && npm run build"

# ============================================
# 10. 配置 PM2
# ============================================
echo -e "${GREEN}[10/10] 配置 PM2...${NC}"

# 创建 PM2 配置文件
sudo -u $RUNNING_USER bash -c "cat > $PROJECT_DIR/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'video-api',
    script: '$PROJECT_DIR/remotion-video/server/server.js',
    cwd: '$PROJECT_DIR/remotion-video/server',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: $BACKEND_PORT
    },
    error_file: '/var/log/video-api/error.log',
    out_file: '/var/log/video-api/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false
  }]
};
EOF"

# 创建日志目录
sudo mkdir -p /var/log/video-api
sudo chown $RUNNING_USER:$RUNNING_USER /var/log/video-api

# 启动服务
sudo -u $RUNNING_USER pm2 start $PROJECT_DIR/ecosystem.config.js
sudo -u $RUNNING_USER pm2 save
sudo pm2 startup systemd -u $RUNNING_USER --hp /home/$RUNNING_USER

# ============================================
# 11. 配置防火墙
# ============================================
echo -e "${GREEN}[11/11] 配置防火墙...${NC}"
sudo systemctl start firewalld 2>/dev/null || true
sudo systemctl enable firewalld 2>/dev/null || true
sudo firewall-cmd --permanent --add-service=http 2>/dev/null || true
sudo firewall-cmd --permanent --add-service=https 2>/dev/null || true
sudo firewall-cmd --reload 2>/dev/null || true

# ============================================
# 12. 生成 SSL 证书（自签名）
# ============================================
echo -e "${GREEN}[12/12] 生成 SSL 证书...${NC}"
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/private.key \
  -out /etc/nginx/ssl/certificate.crt \
  -subj "/C=CN/ST=State/L=City/O=Organization/CN=localhost"

# ============================================
# 13. 配置 Nginx
# ============================================
echo -e "${GREEN}[13/13] 配置 Nginx...${NC}"

sudo bash -c "cat > /etc/nginx/conf.d/video-format-demo.conf << 'EOF'
# HTTP 配置 (重定向到 HTTPS)
server {
    listen 80;
    listen [::]:80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;

    ssl_certificate /etc/nginx/ssl/certificate.crt;
    ssl_certificate_key /etc/nginx/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    access_log /var/log/nginx/video-format-demo-access.log;
    error_log /var/log/nginx/video-format-demo-error.log;

    # 前端静态文件
    location / {
        root $PROJECT_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        expires 7d;
        add_header Cache-Control \"public, immutable\";
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    # 媒体文件代理
    location /assets/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /outputs/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /background-video/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    client_max_body_size 100M;
}
EOF"

# 测试并重载 Nginx
sudo nginx -t && sudo systemctl reload nginx

# ============================================
# 完成
# ============================================
echo ""
echo "=========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "=========================================="
echo ""
echo "项目目录: $PROJECT_DIR"
echo "运行用户: $RUNNING_USER"
echo "后端端口: $BACKEND_PORT"
echo ""
echo -e "${YELLOW}接下来需要手动操作：${NC}"
echo "1. 上传配置文件: scp config.toml root@YOUR_SERVER_IP:$PROJECT_DIR/"
echo "2. 编辑配置文件填入 API 密钥: sudo nano $PROJECT_DIR/config.toml"
echo "3. 重启后端服务: sudo -u $RUNNING_USER pm2 restart video-api"
echo ""
echo -e "${GREEN}常用管理命令：${NC}"
echo "  查看状态: sudo -u $RUNNING_USER pm2 status"
echo "  查看日志: sudo -u $RUNNING_USER pm2 logs video-api"
echo "  重启服务: sudo -u $RUNNING_USER pm2 restart video-api"
echo "  重载 Nginx: sudo systemctl reload nginx"
echo ""
