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
    const { theme, style, scene_count, image_style, aspect_ratio, enable_subtitle, insight_text, audio_effects } = req.body;
    const config = getConfig();
    const workflow = config.workflow || {};

    console.log('创建项目请求参数:', { theme, style, scene_count, image_style, aspect_ratio, insight_text: insight_text ? `${insight_text.substring(0, 50)}...` : null, audio_effects });

    // 生成分镜：根据是否有自定义文案选择不同的生成方式
    let result;
    if (insight_text && insight_text.trim()) {
      // 自定义文案模式：按句号拆分，旁白保持原文
      console.log('使用自定义文案模式，文案长度:', insight_text.length);
      result = await generator.generateFromCustomText(
        insight_text,
        image_style || workflow.default_image_style
      );
      console.log('自定义文案生成结果:', result.shots?.length, '个分镜');
    } else {
      // AI 生成模式
      result = await generator.generate(
        theme,
        style || workflow.default_story_tone,
        scene_count || workflow.default_scene_count || 8,
        image_style || workflow.default_image_style
      );
    }

    // 创建项目
    const projectId = db.createProject({
      theme,
      style: style || '',
      aspect_ratio: aspect_ratio || '16:9',
      status: 'draft',
      config: {
        image_style,
        scene_count,
        enable_subtitle: enable_subtitle !== false, // Default to true if not provided
        audio_effects: audio_effects || { enable_bgm: true }
      },
    });

    // 创建分镜
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

// 删除项目
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.deleteProject(id);
    res.json({ success: true });
  } catch (err) {
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
    };

    // 角色形象
    if (project.character_image) {
      assets.characterImage = getFileInfo(project.character_image);
    }

    // 最终视频
    if (project.video_path) {
      assets.finalVideo = getFileInfo(project.video_path);
    }

    // 分镜资产
    if (project.shots) {
      for (const shot of project.shots) {
        // 图片
        const imageInfo = getFileInfo(shot.image_path);
        if (imageInfo) {
          assets.images.push({ ...imageInfo, shotIndex: shot.display_index });
        }

        // 音频
        const audioInfo = getFileInfo(shot.audio_path);
        if (audioInfo) {
          assets.audios.push({ ...audioInfo, shotIndex: shot.display_index });
        }

        // 视频
        const videoInfo = getFileInfo(shot.video_path);
        if (videoInfo) {
          assets.videos.push({ ...videoInfo, shotIndex: shot.display_index });
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
    };

    summary.total = {
      count: summary.images.count + summary.audios.count + summary.videos.count + summary.characterImage.count + summary.finalVideo.count,
      totalSize: summary.images.totalSize + summary.audios.totalSize + summary.videos.totalSize + summary.characterImage.totalSize + summary.finalVideo.totalSize,
    };

    res.json({ assets, summary });
  } catch (err) {
    console.error('Get project assets error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
