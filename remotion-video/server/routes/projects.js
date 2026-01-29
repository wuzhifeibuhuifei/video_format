import { Router } from 'express';
import { ProjectDatabase } from '../lib/database.js';
import { StoryboardGenerator } from '../lib/storyboard.js';
import { getConfig } from '../lib/config.js';
import path from 'path';

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

export default router;
