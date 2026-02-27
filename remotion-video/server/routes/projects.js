import { Router } from 'express';
import { ProjectDatabase } from '../lib/database.js';
import { StoryboardGenerator } from '../lib/storyboard.js';
import { getConfig } from '../lib/config.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const projectRoot = path.join(__dirname, '../../..');

const router = Router();

let db = null;
let generator = null;

// 辅助函数：解析资源文件的绝对路径
function resolveAssetPath(relativePath) {
  if (!relativePath) return null;
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (path.isAbsolute(normalized)) return normalized;
  const candidates = [
    path.join(serverRoot, normalized),
    path.join(projectRoot, normalized),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// 辅助函数：安全删除文件
function safeUnlink(filePath) {
  if (!filePath) return false;
  const absolutePath = resolveAssetPath(filePath);
  if (absolutePath && fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
    return true;
  }
  return false;
}

// 辅助函数：清理项目的所有磁盘资源
function cleanProjectAssets(project) {
  let deletedCount = 0;

  // 清理角色形象
  if (project.character_image && safeUnlink(project.character_image)) {
    deletedCount++;
  }

  // 清理项目背景
  if (project.background_path && safeUnlink(project.background_path)) {
    deletedCount++;
  }

  // 清理最终视频
  if (project.video_path && safeUnlink(project.video_path)) {
    deletedCount++;
  }

  // 清理所有 shot 资源
  const shots = project.shots || [];
  for (const shot of shots) {
    if (shot.image_path && safeUnlink(shot.image_path)) deletedCount++;
    if (shot.audio_path && safeUnlink(shot.audio_path)) deletedCount++;
    if (shot.video_path && safeUnlink(shot.video_path)) deletedCount++;
    if (shot.background_path && safeUnlink(shot.background_path)) deletedCount++;
    if (shot.highlight_sfx_path && safeUnlink(shot.highlight_sfx_path)) deletedCount++;
  }

  // 尝试清理空的项目资源目录
  const projectDirs = [
    path.join(projectRoot, `assets/images/projects/project_${project.id}`),
    path.join(projectRoot, `assets/audio/generated`),
    path.join(projectRoot, `assets/backgrounds/project_${project.id}`),
    path.join(projectRoot, `assets/audio/highlight_sfx/project_${project.id}`),
  ];
  for (const dir of projectDirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        if (files.length === 0) {
          fs.rmdirSync(dir);
        }
      }
    } catch {
      // 忽略目录清理错误
    }
  }

  return deletedCount;
}

export function initProjectRoutes(database) {
  db = database;
  generator = new StoryboardGenerator();
  return router;
}

// 获取项目列表
router.get('/', (req, res) => {
  try {
    const projects = db.listProjects();
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个项目
router.get('/:id', (req, res) => {
  try {
    const project = db.getProject(parseInt(req.params.id));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建项目
router.post('/', async (req, res) => {
  try {
    const { theme, style, scene_count, image_style, aspect_ratio, enable_subtitle, insight_text, audio_effects, category } = req.body;
    const config = getConfig();
    const workflow = config.workflow || {};

    console.log('创建项目请求参数:', { category, theme, style, scene_count, image_style, aspect_ratio, insight_text: insight_text ? `${insight_text.substring(0, 50)}...` : null, audio_effects });

    // 读书解析模式：按自然段落分割文案，不调用 AI
    if (category === 'book_analysis') {
      const projectId = db.createProject({
        theme: theme || '读书解析',
        style: '',
        aspect_ratio: aspect_ratio || '9:16',
        status: 'draft',
        category: 'book_analysis',
        config: {
          enable_subtitle: enable_subtitle !== false,
          audio_effects: audio_effects || { enable_bgm: true },
        },
      });

      // 按换行符分割文案为段落
      if (insight_text && insight_text.trim()) {
        const paragraphs = insight_text
          .split(/\n+/)
          .map(p => p.trim())
          .filter(p => p.length > 0);

        for (let i = 0; i < paragraphs.length; i++) {
          db.createShot({
            project_id: projectId,
            index: i + 1,
            script_text: paragraphs[i],
            image_prompt: '',
            image_path: '',
          });
        }
      }

      const project = db.getProject(projectId);
      return res.json(project);
    }

    // 情感短视频模式（原有逻辑）
    let result;
    if (insight_text && insight_text.trim()) {
      console.log('使用自定义文案模式，文案长度:', insight_text.length);
      result = await generator.generateFromCustomText(
        insight_text,
        image_style || workflow.default_image_style
      );
      console.log('自定义文案生成结果:', result.shots?.length, '个分镜');
    } else {
      result = await generator.generate(
        theme,
        style || workflow.default_story_tone,
        scene_count || workflow.default_scene_count || 8,
        image_style || workflow.default_image_style
      );
    }

    const projectId = db.createProject({
      theme,
      style: style || '',
      aspect_ratio: aspect_ratio || '16:9',
      status: 'draft',
      category: 'emotion',
      config: {
        image_style,
        scene_count,
        enable_subtitle: enable_subtitle !== false,
        audio_effects: audio_effects || { enable_bgm: true }
      },
    });

    const imageRoot = workflow.image_root || 'assets/images/projects';
    for (const shot of result.shots) {
      db.createShot({
        project_id: projectId,
        index: shot.index,
        script_text: shot.script_text,
        image_prompt: shot.image_prompt,
        image_path: path.join(imageRoot, `project_${projectId}`, `scene_${shot.index}.png`),
      });
    }

    const project = db.getProject(projectId);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除项目（同时清理磁盘资源）
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const project = db.getProject(id);

    // 先清理磁盘文件
    if (project) {
      const deletedCount = cleanProjectAssets(project);
      console.log(`Project ${id} assets cleaned: ${deletedCount} files deleted`);
    }

    db.deleteProject(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 上传角色形象图片
router.post('/:id/character-image', async (req, res) => {
  const projectId = parseInt(req.params.id);

  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const uploadedFile = req.files.image;
    const ext = path.extname(uploadedFile.name) || '.png';
    const fileName = `character_${projectId}${ext}`;
    const relativePath = `assets/images/characters/${fileName}`;
    const absolutePath = path.join(__dirname, '../', relativePath);

    // 确保目录存在
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 如果已有角色形象，先删除旧文件
    if (project.character_image) {
      const oldPath = path.join(__dirname, '../', project.character_image);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // 保存新文件
    await uploadedFile.mv(absolutePath);

    // 更新数据库
    db.updateProject(projectId, { character_image: relativePath });

    console.log(`Character image uploaded for project ${projectId}: ${relativePath}`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Character image upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 删除角色形象图片
router.delete('/:id/character-image', (req, res) => {
  const projectId = parseInt(req.params.id);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.character_image) {
      const imagePath = path.join(__dirname, '../', project.character_image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      db.updateProject(projectId, { character_image: null });
    }

    console.log(`Character image deleted for project ${projectId}`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Character image delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 上传读书解析背景（图片或视频）
router.post('/:id/background', async (req, res) => {
  const projectId = parseInt(req.params.id);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = req.files.file;
    const ext = path.extname(uploadedFile.name).toLowerCase();

    // 判断文件类型
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExts = ['.mp4', '.mov', '.webm'];
    let backgroundType;

    if (imageExts.includes(ext)) {
      backgroundType = 'image';
    } else if (videoExts.includes(ext)) {
      backgroundType = 'video';
    } else {
      return res.status(400).json({ error: `不支持的文件格式: ${ext}` });
    }

    const fileName = `background_${projectId}${ext}`;
    const relativePath = `assets/backgrounds/project_${projectId}/${fileName}`;
    const absolutePath = path.join(projectRoot, relativePath);

    // 确保目录存在
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 删除旧背景文件
    if (project.background_path) {
      const oldPath = path.join(projectRoot, project.background_path);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // 保存新文件
    await uploadedFile.mv(absolutePath);

    // 更新数据库
    db.updateProject(projectId, {
      background_type: backgroundType,
      background_path: relativePath,
    });

    console.log(`Background uploaded for project ${projectId}: ${relativePath} (${backgroundType})`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Background upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 从资产空间设置背景
router.post('/:id/background-from-asset', (req, res) => {
  const projectId = parseInt(req.params.id);
  try {
    const project = db.getProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { file_path } = req.body;
    if (!file_path) return res.status(400).json({ error: '缺少文件路径' });
    const ext = path.extname(file_path).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExts = ['.mp4', '.mov', '.webm'];
    let backgroundType;
    if (imageExts.includes(ext)) backgroundType = 'image';
    else if (videoExts.includes(ext)) backgroundType = 'video';
    else return res.status(400).json({ error: `不支持的文件格式: ${ext}` });
    db.updateProject(projectId, { background_type: backgroundType, background_path: file_path });
    res.json(db.getProject(projectId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除读书解析背景
router.delete('/:id/background', (req, res) => {
  const projectId = parseInt(req.params.id);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.background_path) {
      const filePath = path.join(projectRoot, project.background_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      db.updateProject(projectId, {
        background_type: null,
        background_path: null,
      });
    }

    console.log(`Background deleted for project ${projectId}`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Background delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 上传段落独立背景（图片或视频）
router.post('/:id/shots/:shotId/background', async (req, res) => {
  const projectId = parseInt(req.params.id);
  const shotId = parseInt(req.params.shotId);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = req.files.file;
    const ext = path.extname(uploadedFile.name).toLowerCase();

    const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExts = ['.mp4', '.mov', '.webm'];
    let backgroundType;

    if (imageExts.includes(ext)) {
      backgroundType = 'image';
    } else if (videoExts.includes(ext)) {
      backgroundType = 'video';
    } else {
      return res.status(400).json({ error: `不支持的文件格式: ${ext}` });
    }

    const fileName = `shot_${shotId}_bg${ext}`;
    const relativePath = `assets/backgrounds/project_${projectId}/${fileName}`;
    const absolutePath = path.join(projectRoot, relativePath);

    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 删除旧的段落背景文件
    const shots = project.shots || [];
    const currentShot = shots.find(s => s.id === shotId);
    if (currentShot && currentShot.background_path) {
      const oldPath = path.join(projectRoot, currentShot.background_path);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    await uploadedFile.mv(absolutePath);

    db.updateShot(shotId, {
      background_path: relativePath,
      background_type: backgroundType,
    });

    console.log(`Shot background uploaded: shot ${shotId}, project ${projectId}: ${relativePath} (${backgroundType})`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Shot background upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 从资产空间设置段落背景
router.post('/:id/shots/:shotId/background-from-asset', (req, res) => {
  const projectId = parseInt(req.params.id);
  const shotId = parseInt(req.params.shotId);
  console.log('[background-from-asset] projectId:', projectId, 'shotId:', shotId, 'req.params.shotId:', req.params.shotId);
  try {
    const project = db.getProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { file_path } = req.body;
    if (!file_path) return res.status(400).json({ error: '缺少文件路径' });
    const ext = path.extname(file_path).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExts = ['.mp4', '.mov', '.webm'];
    let backgroundType;
    if (imageExts.includes(ext)) backgroundType = 'image';
    else if (videoExts.includes(ext)) backgroundType = 'video';
    else return res.status(400).json({ error: `不支持的文件格式: ${ext}` });
    db.updateShot(shotId, { background_path: file_path, background_type: backgroundType });
    res.json(db.getProject(projectId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除段落独立背景
router.delete('/:id/shots/:shotId/background', (req, res) => {
  const projectId = parseInt(req.params.id);
  const shotId = parseInt(req.params.shotId);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shots = project.shots || [];
    const currentShot = shots.find(s => s.id === shotId);

    if (currentShot && currentShot.background_path) {
      const filePath = path.join(projectRoot, currentShot.background_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      db.updateShot(shotId, {
        background_path: null,
        background_type: null,
      });
    }

    console.log(`Shot background deleted: shot ${shotId}, project ${projectId}`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Shot background delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 上传段落自定义重点标注音效
router.post('/:id/shots/:shotId/highlight-sfx', async (req, res) => {
  const projectId = parseInt(req.params.id);
  const shotId = parseInt(req.params.shotId);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = req.files.file;
    const ext = path.extname(uploadedFile.name).toLowerCase();

    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    if (!audioExts.includes(ext)) {
      return res.status(400).json({ error: `不支持的音频格式: ${ext}` });
    }

    const fileName = `shot_${shotId}_highlight_sfx${ext}`;
    const relativePath = `assets/audio/highlight_sfx/project_${projectId}/${fileName}`;
    const absolutePath = path.join(projectRoot, relativePath);

    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 删除旧的音效文件
    const shots = project.shots || [];
    const currentShot = shots.find(s => s.id === shotId);
    if (currentShot && currentShot.highlight_sfx_path) {
      const oldPath = path.join(projectRoot, currentShot.highlight_sfx_path);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    await uploadedFile.mv(absolutePath);

    db.updateShot(shotId, { highlight_sfx_path: relativePath });

    console.log(`Shot highlight sfx uploaded: shot ${shotId}, project ${projectId}: ${relativePath}`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Shot highlight sfx upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 从资产空间设置段落重点标注音效
router.post('/:id/shots/:shotId/highlight-sfx-from-asset', (req, res) => {
  const projectId = parseInt(req.params.id);
  const shotId = parseInt(req.params.shotId);
  try {
    const project = db.getProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { file_path } = req.body;
    if (!file_path) return res.status(400).json({ error: '缺少文件路径' });
    const ext = path.extname(file_path).toLowerCase();
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    if (!audioExts.includes(ext)) return res.status(400).json({ error: `不支持的音频格式: ${ext}` });
    db.updateShot(shotId, { highlight_sfx_path: file_path });
    res.json(db.getProject(projectId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除段落自定义重点标注音效
router.delete('/:id/shots/:shotId/highlight-sfx', (req, res) => {
  const projectId = parseInt(req.params.id);
  const shotId = parseInt(req.params.shotId);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shots = project.shots || [];
    const currentShot = shots.find(s => s.id === shotId);

    if (currentShot && currentShot.highlight_sfx_path) {
      const filePath = path.join(projectRoot, currentShot.highlight_sfx_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      db.updateShot(shotId, { highlight_sfx_path: null });
    }

    console.log(`Shot highlight sfx deleted: shot ${shotId}, project ${projectId}`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Shot highlight sfx delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 更新项目配置
router.patch('/:id/config', (req, res) => {
  const projectId = parseInt(req.params.id);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { aspect_ratio, enable_subtitle, subtitle_font_size, subtitle_color, enable_bgm, audio_effects, video_effects, timing } = req.body;

    // 合并现有配置
    const existingConfig = (typeof project.config_json === 'string'
      ? JSON.parse(project.config_json || '{}')
      : (project.config || {}));

    const updates = {};

    // 更新直接字段
    if (aspect_ratio) {
      updates.aspect_ratio = aspect_ratio;
    }

    // 更新 config 中的字段
    const newConfig = {
      ...existingConfig,
    };

    if (enable_subtitle !== undefined) {
      newConfig.enable_subtitle = enable_subtitle;
    }

    if (subtitle_font_size !== undefined) {
      newConfig.subtitle_font_size = subtitle_font_size;
    }

    if (subtitle_color !== undefined) {
      newConfig.subtitle_color = subtitle_color;
    }

    if (audio_effects) {
      newConfig.audio_effects = {
        ...(existingConfig.audio_effects || {}),
        ...audio_effects,
      };
    }

    if (video_effects) {
      newConfig.video_effects = {
        ...(existingConfig.video_effects || {}),
        ...video_effects,
      };
    }

    if (timing) {
      newConfig.timing = {
        ...(existingConfig.timing || {}),
        ...timing,
      };
    }

    updates.config = newConfig;

    db.updateProject(projectId, updates);

    console.log(`Project ${projectId} config updated`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Update project config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 获取项目资产统计
router.get('/:id/assets', (req, res) => {
  const projectId = parseInt(req.params.id);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const getFileInfo = (relativePath) => {
      if (!relativePath) return null;

      const normalizedPath = `${relativePath}`.replace(/\\/g, '/');
      const relativeNormalizedPath = normalizedPath.replace(/^\/+/, '');

      const candidates = path.isAbsolute(normalizedPath)
        ? [normalizedPath]
        : [
            path.join(serverRoot, relativeNormalizedPath),
            path.join(projectRoot, relativeNormalizedPath),
          ];

      let foundPath = null;
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          foundPath = candidate;
          break;
        }
      }

      if (!foundPath) return null;

      const stats = fs.statSync(foundPath);
      return {
        path: path.isAbsolute(normalizedPath) ? normalizedPath : relativeNormalizedPath,
        size: stats.size,
        exists: true,
      };
    };

    // 收集各类资产
    const assets = {
      images: [],
      audios: [],
      videos: [],
      characterImage: null,
      finalVideo: null,
      subtitleFile: null,
      subtitledVideo: null,
    };

    // 角色形象
    if (project.character_image) {
      assets.characterImage = getFileInfo(project.character_image);
    }

    // 最终视频
    if (project.video_path) {
      assets.finalVideo = getFileInfo(project.video_path);
    }

    // 合并字幕文件
    if (project.subtitle_path) {
      assets.subtitleFile = getFileInfo(project.subtitle_path);
    }

    // 带字幕视频
    if (project.video_with_subtitles_path) {
      assets.subtitledVideo = getFileInfo(project.video_with_subtitles_path);
    }

    // 分镜资产
    if (project.shots) {
      for (const shot of project.shots) {
        // 图片
        const imageInfo = getFileInfo(shot.image_path);
        if (imageInfo) {
          assets.images.push({ ...imageInfo, shotIndex: shot.display_index, shotId: shot.id });
        }

        // 音频
        const audioInfo = getFileInfo(shot.audio_path);
        if (audioInfo) {
          assets.audios.push({ ...audioInfo, shotIndex: shot.display_index, shotId: shot.id });
        }

        // 视频
        const videoInfo = getFileInfo(shot.video_path);
        if (videoInfo) {
          assets.videos.push({ ...videoInfo, shotIndex: shot.display_index, shotId: shot.id });
        }
      }
    }

    // 计算统计信息
    const calcTotal = (arr) => arr.reduce((sum, item) => sum + (item?.size || 0), 0);

    const summary = {
      images: { count: assets.images.length, totalSize: calcTotal(assets.images) },
      audios: { count: assets.audios.length, totalSize: calcTotal(assets.audios) },
      videos: { count: assets.videos.length, totalSize: calcTotal(assets.videos) },
      characterImage: assets.characterImage ? { count: 1, totalSize: assets.characterImage.size } : { count: 0, totalSize: 0 },
      finalVideo: assets.finalVideo ? { count: 1, totalSize: assets.finalVideo.size } : { count: 0, totalSize: 0 },
      subtitleFile: assets.subtitleFile ? { count: 1, totalSize: assets.subtitleFile.size } : { count: 0, totalSize: 0 },
      subtitledVideo: assets.subtitledVideo ? { count: 1, totalSize: assets.subtitledVideo.size } : { count: 0, totalSize: 0 },
    };

    summary.total = {
      count: summary.images.count + summary.audios.count + summary.videos.count + summary.characterImage.count + summary.finalVideo.count + summary.subtitleFile.count + summary.subtitledVideo.count,
      totalSize: summary.images.totalSize + summary.audios.totalSize + summary.videos.totalSize + summary.characterImage.totalSize + summary.finalVideo.totalSize + summary.subtitleFile.totalSize + summary.subtitledVideo.totalSize,
    };

    res.json({ assets, summary });
  } catch (err) {
    console.error('Get project assets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 批量清理项目资源（按类型或全部）
router.delete('/:id/assets', (req, res) => {
  const projectId = parseInt(req.params.id);
  const assetType = req.query.type; // 可选: images, audios, videos, all

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    let deletedCount = 0;
    const shots = project.shots || [];

    if (!assetType || assetType === 'all') {
      deletedCount = cleanProjectAssets(project);
      // 清除数据库中的资源路径
      for (const shot of shots) {
        db.updateShot(shot.id, {
          image_path: null,
          audio_path: null,
          video_path: null,
          video_status: 'pending',
          background_path: null,
          background_type: null,
        });
      }
      db.updateProject(projectId, {
        video_path: null,
        character_image: null,
        background_path: null,
        background_type: null,
      });
    } else if (assetType === 'images') {
      for (const shot of shots) {
        if (shot.image_path && safeUnlink(shot.image_path)) deletedCount++;
        db.updateShot(shot.id, { image_path: null });
      }
    } else if (assetType === 'audios') {
      for (const shot of shots) {
        if (shot.audio_path && safeUnlink(shot.audio_path)) deletedCount++;
        db.updateShot(shot.id, { audio_path: null });
      }
    } else if (assetType === 'videos') {
      for (const shot of shots) {
        if (shot.video_path && safeUnlink(shot.video_path)) deletedCount++;
        db.updateShot(shot.id, { video_path: null, video_status: 'pending' });
      }
    } else {
      return res.status(400).json({ error: `无效的资源类型: ${assetType}` });
    }

    console.log(`Project ${projectId} assets cleaned (type=${assetType || 'all'}): ${deletedCount} files`);
    const updated = db.getProject(projectId);
    res.json({ success: true, deletedCount, project: updated });
  } catch (err) {
    console.error('Clean project assets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 生成随机视频主题
router.post('/generate-theme', async (req, res) => {
  try {
    const config = getConfig();
    const apiUrl = config.volcengine?.api_url;
    const apiKey = config.volcengine?.api_key;
    const model = config.volcengine?.model || 'deepseek-v3-2-251201';

    if (!apiUrl || !apiKey) {
      return res.status(500).json({ error: 'LLM API not configured' });
    }

    const prompt = `你是一个专业的短视频内容策划师。请生成一个能引发共鸣、深入人心的抖音短视频主题。

要求：
1. 必须是能触动情感的话题（亲情、爱情、友情、成长、孤独、梦想、遗憾等）
2. 用2-4个字概括主题名称
3. 附上一句10-20字的简短描述，能引起目标群体的共鸣
4. 不要重复以下主题：${(req.body.excludedThemes || []).join('、')}

请输出JSON格式：
{
  "title": "主题名称",
  "description": "简短描述",
  "tags": ["标签1", "标签2"]
}

只输出JSON，不要其他内容。`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.0, // 高温度产生更多创意
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 提取JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse theme response');
    }

    const theme = JSON.parse(jsonMatch[0]);
    res.json({ theme });
  } catch (err) {
    console.error('Generate theme error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
