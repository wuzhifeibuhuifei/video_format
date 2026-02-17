import { Router } from 'express';
import { VideoGenerator } from '../lib/video.js';
import { VideoPromptGenerator } from '../lib/videoPrompt.js';
import { TTSClient } from '../lib/tts.js';
import { getConfig } from '../lib/config.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundledFfmpegDir = path.resolve(__dirname, '../assets/ffmpeg');
const bundledFfprobePath = path.join(bundledFfmpegDir, 'ffprobe.exe');

const router = Router();
let db = null;
let videoGen = null;
let promptGen = null;
let tts = null;

export function initVideoRoutes(database) {
  db = database;
  videoGen = new VideoGenerator();
  promptGen = new VideoPromptGenerator();
  tts = new TTSClient();
  return router;
}

// 获取音频时长
async function getAudioDuration(audioPath) {
  try {
    if (fs.existsSync(bundledFfprobePath)) {
      const cmd = `"${bundledFfprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
      const result = execSync(cmd, { encoding: 'utf-8' }).trim();
      const duration = parseFloat(result);
      if (!isNaN(duration) && duration > 0) {
        console.log(`  音频时长 (ffprobe): ${duration.toFixed(2)}秒`);
        return duration;
      }
    } else {
      console.warn(`ffprobe 不存在: ${bundledFfprobePath}`);
    }
  } catch (err) {
    console.warn(`ffprobe 获取音频时长失败: ${err.message}`);
  }
  // 降级方案
  const stats = fs.statSync(audioPath);
  const bitrate = 128000;
  return (stats.size * 8) / bitrate;
}

// 为单个镜头生成视频提示词
router.post('/:projectId/shots/:shotId/video-prompt', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const shotId = parseInt(req.params.shotId);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shot = project.shots?.find(s => s.id === shotId);
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }

    console.log(`Generating video prompt for shot ${shot.display_index}`);
    const videoPrompt = await promptGen.generateForShot(
      shot,
      project.image_style,
      project.theme
    );

    // 保存到数据库
    db.updateShot(shotId, { video_prompt: videoPrompt });

    res.json({ video_prompt: videoPrompt });
  } catch (err) {
    console.error('Video prompt generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 更新单个镜头信息
router.patch('/:projectId/shots/:shotId', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const shotId = parseInt(req.params.shotId);
  const updates = req.body;

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shot = project.shots?.find(s => s.id === shotId);
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }

    db.updateShot(shotId, updates);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Shot update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 为单个镜头生成视频（图生视频）
router.post('/:projectId/shots/:shotId/video', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const shotId = parseInt(req.params.shotId);
  const { prompt } = req.body;
  const useAiPrompt = req.query.use_ai_prompt !== 'false';

  console.log(`\n========== 单个镜头视频生成 ==========`);
  console.log(`项目ID: ${projectId}, 镜头ID: ${shotId}`);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      console.log(`✗ 项目不存在`);
      return res.status(404).json({ error: 'Project not found' });
    }

    const shot = project.shots?.find(s => s.id === shotId);
    if (!shot) {
      console.log(`✗ 镜头不存在`);
      return res.status(404).json({ error: 'Shot not found' });
    }

    console.log(`镜头 ${shot.display_index}: ${shot.script_text.substring(0, 30)}...`);

    if (!shot.image_path || !fs.existsSync(shot.image_path)) {
      console.log(`✗ 图片不存在: ${shot.image_path}`);
      return res.status(400).json({ error: 'Shot image not found' });
    }
    console.log(`✓ 图片: ${shot.image_path}`);

    const config = getConfig();
    const workflow = config.workflow || {};
    const audioRoot = workflow.audio_root || 'assets/audio/generated';

    // 1. 先生成音频（如果不存在）
    console.log(`\n[步骤1] 检查/生成音频`);
    const audioPath = path.join(audioRoot, `project_${projectId}_shot_${shot.display_index}.mp3`);
    if (!fs.existsSync(audioPath)) {
      console.log(`  → 生成音频...`);
      await tts.synthesize(shot.script_text, audioPath, { voice_id: shot.voice_id });
      db.updateShot(shotId, { audio_path: audioPath });
      console.log(`  ✓ 音频已生成: ${audioPath}`);
    } else {
      console.log(`  ○ 音频已存在: ${audioPath}`);
    }

    // 2. 获取音频时长
    console.log(`\n[步骤2] 获取音频时长`);
    const audioDuration = await getAudioDuration(audioPath);

    // 3. 根据音频时长计算视频帧数
    // frames 取值范围：[29, 289]，必须满足 25 + 4n 格式
    console.log(`\n[步骤3] 计算视频帧数`);
    const minFrames = 29;
    const maxFrames = 289;
    const targetFrames = audioDuration * 24;

    // 计算最接近的 25 + 4n 值
    const n = Math.round((targetFrames - 25) / 4);
    let frames = 25 + 4 * Math.max(1, n);
    frames = Math.max(minFrames, Math.min(maxFrames, frames));

    const videoDuration = frames / 24;
    console.log(`  音频时长: ${audioDuration.toFixed(2)}s → 目标帧数: ${targetFrames.toFixed(1)}`);
    console.log(`  有效帧数: ${frames} (25+4n格式) → 视频时长: ${videoDuration.toFixed(3)}s`)

    // 生成视频输出路径
    const videoDir = `assets/videos/projects/project_${projectId}`;
    const videoPath = `${videoDir}/shot_${shot.display_index}.mp4`;

    // 确定视频 prompt
    console.log(`\n[步骤4] 确定视频 Prompt`);
    let videoPrompt = prompt;
    if (!videoPrompt && useAiPrompt) {
      console.log(`  → AI 生成 Prompt...`);
      videoPrompt = await promptGen.generateForShot(shot, project.image_style, project.theme);
      console.log(`  ✓ Prompt: ${videoPrompt.substring(0, 50)}...`);
    } else if (videoPrompt) {
      console.log(`  ○ 使用传入的 Prompt`);
    }
    videoPrompt = videoPrompt || shot.image_prompt || '';

    // 5. 生成视频
    console.log(`\n[步骤5] 生成视频`);
    console.log(`  输出: ${videoPath}`);
    console.log(`  音频时长: ${audioDuration.toFixed(2)}秒`);
    await videoGen.generate(shot.image_path, videoPrompt, videoPath, { audioDuration: videoDuration });
    console.log(`  ✓ 视频生成完成`);

    db.updateShot(shotId, { video_path: videoPath, video_prompt: videoPrompt });
    console.log(`========== 完成 ==========\n`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error(`✗ 视频生成失败: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 为项目所有镜头生成视频
router.post('/:projectId/videos', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const missingOnly = req.query.missing_only === 'true';
  const useAiPrompt = req.query.use_ai_prompt !== 'false';

  console.log(`\n========== 批量视频生成 ==========`);
  console.log(`项目ID: ${projectId}, 仅缺失: ${missingOnly}, AI Prompt: ${useAiPrompt}`);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      console.log(`✗ 项目不存在`);
      return res.status(404).json({ error: 'Project not found' });
    }

    const config = getConfig();
    const workflow = config.workflow || {};
    const audioRoot = workflow.audio_root || 'assets/audio/generated';
    const shots = project.shots || [];
    const videoDir = `assets/videos/projects/project_${projectId}`;

    console.log(`总镜头数: ${shots.length}`);

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      console.log(`\n---------- 镜头 ${i + 1}/${shots.length} ----------`);
      console.log(`镜头 ${shot.display_index}: ${shot.script_text.substring(0, 30)}...`);

      if (!shot.image_path || !fs.existsSync(shot.image_path)) {
        console.log(`  ✗ 跳过: 图片不存在`);
        continue;
      }

      const videoPath = `${videoDir}/shot_${shot.display_index}.mp4`;

      if (missingOnly && fs.existsSync(videoPath)) {
        console.log(`  ○ 跳过: 视频已存在`);
        continue;
      }

      // 1. 先生成音频
      console.log(`  [1] 检查/生成音频`);
      const audioPath = path.join(audioRoot, `project_${projectId}_shot_${shot.display_index}.mp3`);
      if (!fs.existsSync(audioPath)) {
        console.log(`      → 生成音频...`);
        await tts.synthesize(shot.script_text, audioPath, { voice_id: shot.voice_id });
        db.updateShot(shot.id, { audio_path: audioPath });
        console.log(`      ✓ 完成`);
      } else {
        console.log(`      ○ 已存在`);
      }

      // 2. 获取音频时长
      console.log(`  [2] 获取音频时长`);
      const audioDuration = await getAudioDuration(audioPath);

      // 3. 根据音频时长计算视频帧数
      // frames 取值范围：[29, 289]，必须满足 25 + 4n 格式
      const minFrames = 29;
      const maxFrames = 289;
      const targetFrames = audioDuration * 24;
      const n = Math.round((targetFrames - 25) / 4);
      let frames = 25 + 4 * Math.max(1, n);
      frames = Math.max(minFrames, Math.min(maxFrames, frames));
      const videoDuration = frames / 24;
      console.log(`  [3] 音频: ${audioDuration.toFixed(2)}s → 帧数: ${frames} → 视频: ${videoDuration.toFixed(3)}s`);

      // 4. 生成视频 prompt
      let videoPrompt = shot.video_prompt;
      if (!videoPrompt && useAiPrompt) {
        console.log(`  [4] AI 生成 Prompt...`);
        videoPrompt = await promptGen.generateForShot(shot, project.image_style, project.theme);
      }
      videoPrompt = videoPrompt || shot.image_prompt || '';

      // 5. 生成视频
      console.log(`  [5] 生成视频: ${videoPath}`);
      await videoGen.generate(shot.image_path, videoPrompt, videoPath, { audioDuration: videoDuration });
      db.updateShot(shot.id, { video_path: videoPath, video_prompt: videoPrompt });
      console.log(`  ✓ 完成`);
    }

    console.log(`\n========== 批量生成完成 ==========\n`);
    res.json(db.getProject(projectId));
  } catch (err) {
    console.error(`✗ 批量生成失败: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
