import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const projectRoot = path.join(__dirname, '../../..');

const router = Router();
let db = null;

export function initShotRoutes(database) {
  db = database;
  return router;
}

// 更新项目的所有镜头
router.put('/:projectId/shots', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { shots } = req.body;

    for (const shot of shots) {
      const updates = {
        script_text: shot.script_text,
        image_prompt: shot.image_prompt,
        voice_id: shot.voice_id || '',
        highlight_text: shot.highlight_text || '',
      };
      // highlight_sfx_path 由专用上传/删除接口管理，仅在明确传入时才更新
      if (shot.highlight_sfx_path !== undefined) {
        updates.highlight_sfx_path = shot.highlight_sfx_path;
      }
      db.updateShot(shot.id, updates);
    }

    const project = db.getProject(projectId);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 添加单个镜头/段落
router.post('/:projectId/shots', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { script_text, after_index } = req.body;

    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shots = project.shots || [];
    const insertIndex = after_index != null ? after_index + 1 : shots.length + 1;

    // 先将 insertIndex 及之后的 shot 的 display_index 后移（从大到小避免 UNIQUE 冲突）
    const toShift = shots
      .filter(s => s.display_index >= insertIndex)
      .sort((a, b) => b.display_index - a.display_index);
    for (const s of toShift) {
      db.updateShot(s.id, { display_index: s.display_index + 1 });
    }

    db.createShot({
      project_id: projectId,
      index: insertIndex,
      script_text: script_text || '',
      image_prompt: '',
      image_path: '',
    });

    const updated = db.getProject(projectId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 复制单个镜头/段落
router.post('/:projectId/shots/:shotId/duplicate', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const shotId = parseInt(req.params.shotId);

    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shots = project.shots || [];
    const sourceShot = shots.find(s => s.id === shotId);
    if (!sourceShot) {
      return res.status(404).json({ error: 'Shot not found' });
    }

    const insertIndex = sourceShot.display_index + 1;

    // 将 insertIndex 及之后的 shot 的 display_index 后移（从大到小避免 UNIQUE 冲突）
    const toShift = shots
      .filter(s => s.display_index >= insertIndex)
      .sort((a, b) => b.display_index - a.display_index);
    for (const s of toShift) {
      db.updateShot(s.id, { display_index: s.display_index + 1 });
    }

    // 创建副本（复制文本内容，不复制生成的资源文件）
    const newShotId = db.createShot({
      project_id: projectId,
      index: insertIndex,
      script_text: sourceShot.script_text || '',
      image_prompt: sourceShot.image_prompt || '',
      image_path: '',
      voice_id: sourceShot.voice_id || '',
    });

    // 复制扩展字段（migrated columns 不在 createShot 中）
    if (sourceShot.highlight_text) {
      db.updateShot(newShotId, { highlight_text: sourceShot.highlight_text });
    }
    if (sourceShot.highlight_sfx_path) {
      db.updateShot(newShotId, { highlight_sfx_path: sourceShot.highlight_sfx_path });
    }

    const updated = db.getProject(projectId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除单个镜头/段落
router.delete('/:projectId/shots/:shotId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const shotId = parseInt(req.params.shotId);

    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    db.deleteShot(shotId);

    const updated = db.getProject(projectId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// 删除 shot 的指定资源（image / audio / video）
router.delete('/:projectId/shots/:shotId/asset/:assetType', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const shotId = parseInt(req.params.shotId);
    const assetType = req.params.assetType;

    const validTypes = ['image', 'audio', 'video'];
    if (!validTypes.includes(assetType)) {
      return res.status(400).json({ error: `无效的资源类型: ${assetType}` });
    }

    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shots = project.shots || [];
    const shot = shots.find(s => s.id === shotId);
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }

    const fieldMap = {
      image: 'image_path',
      audio: 'audio_path',
      video: 'video_path',
    };
    const dbField = fieldMap[assetType];
    const filePath = shot[dbField];

    if (filePath) {
      const absolutePath = resolveAssetPath(filePath);
      if (absolutePath && fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
      db.updateShot(shotId, { [dbField]: null });

      // 如果删除的是视频，同时重置视频状态
      if (assetType === 'video') {
        db.updateShot(shotId, { video_status: 'pending' });
      }
    }

    console.log(`Shot ${shotId} ${assetType} asset deleted (project ${projectId})`);
    const updated = db.getProject(projectId);
    res.json(updated);
  } catch (err) {
    console.error('Delete shot asset error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
