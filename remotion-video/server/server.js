import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fileUpload from 'express-fileupload';

import { loadConfig } from './lib/config.js';
import { ProjectDatabase } from './lib/database.js';
import { initProjectRoutes } from './routes/projects.js';
import { initShotRoutes } from './routes/shots.js';
import { initImageRoutes } from './routes/images.js';
import { initRenderRoutes } from './routes/render.js';
import { initVideoRoutes } from './routes/videos.js';
import { initVoiceRoutes } from './routes/voice.js';
import { initImageStyleRoutes } from './routes/imageStyles.js';
import { initSettingsRoutes } from './routes/settings.js';
import { initAssetRoutes } from './routes/assets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// 加载配置
const configPath = path.join(__dirname, '../../config.toml');
const config = loadConfig(configPath);

// Basic Auth 中间件
const basicAuth = (req, res, next) => {
  const authConfig = config.auth || {};

  // 如果未启用认证，直接放行
  if (!authConfig.enable) {
    return next();
  }

  // 健康检查端点不需要认证
  if (req.path === '/health') {
    return next();
  }

  // 静态资源路径不需要认证（Remotion 渲染器无法传递认证头）
  if (req.path.startsWith('/assets') || req.path.startsWith('/outputs') || req.path.startsWith('/background-video')) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Video Format Demo"');
    return res.status(401).json({ error: '需要认证' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [username, password] = credentials.split(':');

  if (username === authConfig.username && password === authConfig.password) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Video Format Demo"');
  return res.status(401).json({ error: '用户名或密码错误' });
};

// 初始化数据库
const dbPath = config.database?.path || 'data/projects.db';
const db = new ProjectDatabase(path.join(__dirname, '../..', dbPath));

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload({
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB（支持视频背景上传）
  abortOnLimit: true,
  defParamCharset: 'utf8',
  uriDecodeFileNames: true,
}));

// 静态文件服务 - 需要在 Auth 之前，因为播放器无法传递认证信息
// 媒体文件需要特殊处理：添加 CORS 头并跳过认证
const mediaCorsOptions = {
  origin: '*',
  methods: 'GET',
  allowedHeaders: 'Content-Type',
  exposedHeaders: 'Content-Length, Content-Type',
};

app.use('/assets', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  next();
});
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/assets', express.static(path.join(__dirname, '../../assets')));

app.use('/outputs', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  next();
});
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use('/outputs', express.static(path.join(__dirname, '../../outputs')));

app.use('/background-video', express.static(path.join(__dirname, '../public/background-video')));

// 应用 Basic Auth 认证（API 路由需要，静态文件不需要）
app.use(basicAuth);

// API 路由
app.use('/api/projects', initProjectRoutes(db));
app.use('/api/projects', initShotRoutes(db));
app.use('/api/projects', initImageRoutes(db));
app.use('/api/projects', initRenderRoutes(db));
app.use('/api/projects', initVideoRoutes(db));
app.use('/api/voice', initVoiceRoutes());
app.use('/api/image-styles', initImageStyleRoutes(db));
app.use('/api/settings', initSettingsRoutes());
app.use('/api/assets', initAssetRoutes(db));

// 配置 API
app.get('/api/config', (req, res) => {
  const workflow = config.workflow || {};
  const audioEffects = config.audio_effects || {};
  res.json({
    default_image_style: workflow.default_image_style || '',
    default_story_tone: workflow.default_story_tone || '',
    default_scene_count: workflow.default_scene_count || 8,
    enable_bgm: audioEffects.enable_bgm !== false,
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 启动服务
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
