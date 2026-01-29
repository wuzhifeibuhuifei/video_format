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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// 加载配置
const configPath = path.join(__dirname, '../../config.toml');
const config = loadConfig(configPath);

// 初始化数据库
const dbPath = config.database?.path || 'data/projects.db';
const db = new ProjectDatabase(path.join(__dirname, '../..', dbPath));

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  abortOnLimit: true,
}));

// 静态文件服务
// 修复：先尝试 server/assets，再尝试项目根目录的 assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/assets', express.static(path.join(__dirname, '../../assets')));
app.use('/outputs', express.static(path.join(__dirname, '../../outputs')));

// API 路由
app.use('/api/projects', initProjectRoutes(db));
app.use('/api/projects', initShotRoutes(db));
app.use('/api/projects', initImageRoutes(db));
app.use('/api/projects', initRenderRoutes(db));
app.use('/api/projects', initVideoRoutes(db));
app.use('/api/voice', initVoiceRoutes());

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
