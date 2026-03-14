import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateSrtFile } from '../lib/tts.js';

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
router.put('/:projectId/shots', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { shots } = req.body;

    for (const shot of shots) {
      let finalScriptText = shot.script_text;

      // 1. ========= 重点标注自动独立成句 =========
      if (shot.highlight_text && finalScriptText) {
        finalScriptText = splitHighlightAsSentence(finalScriptText, shot.highlight_text);
      }

      // 准备数据库更新字段
      const updates = {
        script_text: finalScriptText,
        image_prompt: shot.image_prompt,
        voice_id: shot.voice_id || '',
        highlight_text: shot.highlight_text || '',
      };

      if (shot.highlight_sfx_path !== undefined) {
        updates.highlight_sfx_path = shot.highlight_sfx_path;
      }

      // 2. ========= 文案变化时智能处理 =========
      if (finalScriptText !== undefined && shot.id) {
        const project = db.getProject(projectId);
        const shotId = parseInt(shot.id);
        const oldShot = (project.shots || []).find(s => s.id === shotId);

        const changeType = detectScriptChangeType(oldShot?.script_text, finalScriptText);

        if (changeType === 'punctuation') {
          // 只有标点变化：使用 Whisper 重新对齐字幕
          console.log(`[shots] Shot ${shotId} 只有标点变化，使用 Whisper 重新对齐`);
          if (oldShot.audio_path) {
            const audioPath = resolveAssetPath(oldShot.audio_path);
            if (audioPath && fs.existsSync(audioPath)) {
              // 获取现有的字幕时间戳用于降级
              const metadata = oldShot.metadata_json ? JSON.parse(oldShot.metadata_json) : {};
              const existingTimestamps = metadata.subtitleTimestamps || null;

              const newTimestamps = await resplitSubtitleWithWhisper(audioPath, finalScriptText, existingTimestamps);
              if (newTimestamps && oldShot.subtitle_path) {
                // 重新生成 SRT 文件
                const srtPath = resolveAssetPath(oldShot.subtitle_path);
                if (srtPath) {
                  generateSrtFile(newTimestamps, srtPath);
                  // 更新 metadata_json
                  updates.metadata_json = JSON.stringify({
                    ...metadata,
                    subtitleTimestamps: newTimestamps,
                    scriptTextHash: finalScriptText,
                  });
                }
              }
            }
          }
        } else if (changeType === 'content') {
          // 实质内容变化：删除字幕和音频，触发重新生成
          console.log(`[shots] Shot ${shotId} 文案内容变化，清除旧资源`);
          if (oldShot.subtitle_path) {
            const oldSrtPath = resolveAssetPath(oldShot.subtitle_path);
            if (oldSrtPath && fs.existsSync(oldSrtPath)) {
              fs.unlinkSync(oldSrtPath);
            }
          }
          updates.subtitle_path = null;
          if (oldShot.audio_path) {
            const oldAudioPath = resolveAssetPath(oldShot.audio_path);
            if (oldAudioPath && fs.existsSync(oldAudioPath)) {
              fs.unlinkSync(oldAudioPath);
            }
          }
          updates.audio_path = null;
          updates.metadata_json = null;
        }
      }

      db.updateShot(shot.id, updates);
    }

    const project = db.getProject(projectId);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 单个段落更新接口 PATCH /:projectId/shots/:shotId
router.patch('/:projectId/shots/:shotId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const shotId = parseInt(req.params.shotId);
    const updates = req.body;

    const project = db.getProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const oldShot = (project.shots || []).find(s => s.id === shotId);
    if (!oldShot) return res.status(404).json({ error: 'Shot not found' });

    let finalScriptText = (updates.script_text !== undefined) ? updates.script_text : oldShot.script_text;
    const finalHighlightText = (updates.highlight_text !== undefined) ? updates.highlight_text : oldShot.highlight_text;

    // 1. ========= 重点标注自动独立成句 =========
    if (finalHighlightText && finalScriptText) {
      const result = splitHighlightAsSentence(finalScriptText, finalHighlightText);
      if (result !== finalScriptText) {
        finalScriptText = result;
        updates.script_text = finalScriptText;
        console.log(`[shots-PATCH] Shot ${shotId} 已自动独立成句: "${finalScriptText}"`);
      }
    }

    // 2. ========= 文案变化时智能处理 =========
    if (updates.script_text !== undefined) {
      const changeType = detectScriptChangeType(oldShot.script_text, updates.script_text);

      if (changeType === 'punctuation') {
        // 只有标点变化：使用 Whisper 重新对齐字幕
        console.log(`[shots-PATCH] Shot ${shotId} 只有标点变化，使用 Whisper 重新对齐`);
        if (oldShot.audio_path) {
          const audioPath = resolveAssetPath(oldShot.audio_path);
          if (audioPath && fs.existsSync(audioPath)) {
            // 获取现有的字幕时间戳用于降级
            const metadata = oldShot.metadata_json ? JSON.parse(oldShot.metadata_json) : {};
            const existingTimestamps = metadata.subtitleTimestamps || null;

            const newTimestamps = await resplitSubtitleWithWhisper(audioPath, updates.script_text, existingTimestamps);
            if (newTimestamps && oldShot.subtitle_path) {
              // 重新生成 SRT 文件
              const srtPath = resolveAssetPath(oldShot.subtitle_path);
              if (srtPath) {
                generateSrtFile(newTimestamps, srtPath);
                // 更新 metadata_json
                updates.metadata_json = JSON.stringify({
                  ...metadata,
                  subtitleTimestamps: newTimestamps,
                  scriptTextHash: updates.script_text,
                });
              }
            }
          }
        }
      } else if (changeType === 'content') {
        // 实质内容变化：删除字幕和音频，触发重新生成
        console.log(`[shots-PATCH] Shot ${shotId} 文案内容变化，清除旧资源`);
        if (oldShot.subtitle_path) {
          const oldSrtPath = resolveAssetPath(oldShot.subtitle_path);
          if (oldSrtPath && fs.existsSync(oldSrtPath)) {
            fs.unlinkSync(oldSrtPath);
          }
        }
        updates.subtitle_path = null;
        if (oldShot.audio_path) {
          const oldAudioPath = resolveAssetPath(oldShot.audio_path);
          if (oldAudioPath && fs.existsSync(oldAudioPath)) {
            fs.unlinkSync(oldAudioPath);
          }
        }
        updates.audio_path = null;
        updates.metadata_json = null;
      }
    }

    db.updateShot(shotId, updates);
    const updated = db.getProject(projectId);
    res.json(updated);
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

// ========= 辅助函数：将重点标注文字拆分为独立句子 =========
// 若 highlight 不是整段文字，则在其前后插入句号，使其成为独立句子
export function splitHighlightAsSentence(scriptText, highlightText) {
  if (!highlightText || !scriptText) return scriptText;

  const highlight = highlightText.trim();
  const text = scriptText.trim();

  if (text === highlight || !text.includes(highlight)) return scriptText;

  const punctuationRegex = /[，。！？；、：,\.!\?;:]/;
  const index = text.indexOf(highlight);
  const beforeText = text.substring(0, index);
  const afterText = text.substring(index + highlight.length);

  // 用于拼接的前缀和后缀
  let prefix = beforeText;
  let suffix = afterText;

  // 前面有文字且末尾没有标点 → 插入逗号
  if (beforeText.trim().length > 0 && !punctuationRegex.test(beforeText.trim().slice(-1))) {
    prefix = beforeText.trimEnd() + '，';
  }

  // 后面有文字且开头没有标点 → 前面插入逗号
  if (afterText.trim().length > 0 && !punctuationRegex.test(afterText.trim()[0])) {
    suffix = '，' + afterText.trimStart();
  }

  const newText = prefix + highlight + suffix;
  return newText === text ? scriptText : newText;
}

// ========= 辅助函数：检测文案变化类型 =========
/**
 * 检测文案变化类型
 * @param {string} oldText - 原文案
 * @param {string} newText - 新文案
 * @returns {'none' | 'punctuation' | 'content'}
 */
function detectScriptChangeType(oldText, newText) {
  if (oldText === newText) return 'none';

  // 去除所有标点和空白后比较
  const stripPunctuation = (s) => s.replace(/[，。！？；、：,\.!\?;:\s]/g, '');
  if (stripPunctuation(oldText || '') === stripPunctuation(newText || '')) {
    return 'punctuation'; // 只有标点变化
  }
  return 'content'; // 实质内容变化
}

// ========= 辅助函数：使用 Whisper 重新对齐字幕 =========
/**
 * 使用 Whisper 重新对齐字幕时间戳（更精确）
 * 如果 Whisper 失败，降级到比例分配方案
 * @param {string} audioPath - 音频文件路径
 * @param {string} newScriptText - 新的文案（只是标点变化）
 * @param {Array} existingTimestamps - 现有的字幕时间戳（用于降级）
 * @returns {Promise<Array>} 重新切分后的字幕时间戳
 */
async function resplitSubtitleWithWhisper(audioPath, newScriptText, existingTimestamps = null) {
  try {
    const { WhisperClient } = await import('../lib/whisper.js');
    const whisper = new WhisperClient();

    // 使用 Whisper 重新识别音频
    const whisperResult = await whisper.transcribe(audioPath);

    // 按新文案分段对齐
    const timestamps = whisper.alignWithOriginalText(
      whisperResult,
      newScriptText,
      'punctuation'
    );

    console.log(`[shots] Whisper 重新对齐完成: ${timestamps.length} 条字幕`);
    return timestamps;
  } catch (err) {
    console.error('[shots] Whisper 对齐失败:', err.message);

    // 降级：使用比例分配方案
    if (existingTimestamps && existingTimestamps.length > 0) {
      console.log('[shots] 降级到比例分配方案');
      return resplitSubtitleByRatio(existingTimestamps, newScriptText);
    }

    return null;
  }
}

// ========= 辅助函数：按比例分配重新切分字幕 =========
/**
 * 根据新的分段，按比例分配时间戳
 * @param {Array} existingTimestamps - 现有的字幕时间戳
 * @param {string} newScriptText - 新的文案（只是标点变化）
 * @returns {Array} 重新切分后的字幕时间戳
 */
function resplitSubtitleByRatio(existingTimestamps, newScriptText) {
  if (!existingTimestamps || existingTimestamps.length === 0) return null;

  // 合并所有时间戳为完整段落
  const merged = {
    text: existingTimestamps.map(ts => ts.text).join(''),
    startMs: existingTimestamps[0].startMs,
    endMs: existingTimestamps[existingTimestamps.length - 1].endMs,
  };

  // 按标点分割新文案
  const sentences = newScriptText.split(/(?<=[，。！？；、：,\.!\?;:])/).filter(s => s.trim().length > 0);

  if (sentences.length <= 1) {
    return [{ ...merged, text: newScriptText.replace(/[，。！？；、：,\.!\?;:]+$/g, '').trim() }];
  }

  // 计算每句的加权值
  const weights = sentences.map(s => {
    let weight = s.length;
    const lastChar = s.trim().slice(-1);
    if ('。！？'.includes(lastChar)) weight += 4;
    else if ('；;'.includes(lastChar)) weight += 3;
    else if ('，、,'.includes(lastChar)) weight += 1.5;
    return weight;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const duration = merged.endMs - merged.startMs;
  let currentMs = merged.startMs;
  const result = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentenceDuration = (weights[i] / totalWeight) * duration;
    result.push({
      text: sentences[i].replace(/[，。！？；、：,\.!\?;:]+$/g, '').trim(),
      startMs: currentMs,
      endMs: currentMs + sentenceDuration,
    });
    currentMs += sentenceDuration;
  }

  return result;
}

export default router;
