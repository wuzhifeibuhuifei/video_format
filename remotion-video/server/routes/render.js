import { Router } from 'express';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, getVideoMetadata } from '@remotion/renderer';
import { TTSClient } from '../lib/tts.js';
import { VideoGenerator } from '../lib/video.js';
import { VideoPromptGenerator } from '../lib/videoPrompt.js';
import { getConfig } from '../lib/config.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { execSync, spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

let db = null;
let tts = null;
let videoGen = null;
let promptGen = null;
const renderJobs = new Map();

export function initRenderRoutes(database) {
  db = database;
  tts = new TTSClient();
  videoGen = new VideoGenerator();
  promptGen = new VideoPromptGenerator();
  return router;
}

// 获取渲染进度
router.get('/:projectId/progress', (req, res) => {
  const projectId = req.params.projectId;
  const job = renderJobs.get(`project_${projectId}`);
  if (!job) {
    return res.json({ status: 'idle', progress: null });
  }
  res.json({
    status: 'running',
    progress: {
      current: job.percent,
      total: 100,
      stage: job.stage,
      message: job.message,
      percent: job.percent,
    },
  });
});

// 确认并渲染项目
router.post('/:projectId/confirm', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const taskId = `project_${projectId}`;

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    renderJobs.set(taskId, { stage: 'tts', percent: 0, message: '准备中...' });

    // 异步处理
    processRender(projectId, taskId).catch(err => {
      renderJobs.set(taskId, { stage: 'error', percent: 0, message: err.message });
    });

    // 返回当前项目状态
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function processRender(projectId, taskId) {
  const config = getConfig();
  const workflow = config.workflow || {};
  const audioRoot = workflow.audio_root || 'assets/audio/generated';
  const videoRoot = workflow.video_root || 'outputs';
  const shotVideoRoot = 'assets/videos/projects';

  const project = db.getProject(projectId);
  const shots = project.shots || [];

  // 检查是否启用 AI 视频生成
  const volcVideoConfig = config.volcengine_video || {};
  const enableAiVideo = volcVideoConfig.enable || false;
  console.log(`AI 视频生成配置: enable=${enableAiVideo}, endpoint=${volcVideoConfig.model_endpoint}`);

  // 1. 生成 TTS 音频 (0-20%)
  const audioPaths = [];
  console.log(`\n========== 开始生成 TTS 音频 ==========`);
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const shotIndex = shot.display_index || shot.index || (i + 1);
    const audioPath = path.join(audioRoot, `project_${projectId}_shot_${shotIndex}.mp3`);

    const ttsProgress = Math.round((i / shots.length) * 20);
    renderJobs.set(taskId, {
      stage: 'tts',
      percent: ttsProgress,
      message: `生成语音 ${i + 1}/${shots.length}`,
    });
    console.log(`[${ttsProgress}%] 生成语音 ${i + 1}/${shots.length}: ${shot.script_text.substring(0, 20)}...`);

    if (!fs.existsSync(audioPath)) {
      await tts.synthesize(shot.script_text, audioPath, { voice_id: shot.voice_id });
      console.log(`  ✓ 已保存: ${audioPath}`);
    } else {
      console.log(`  ○ 跳过已存在的音频: ${audioPath}`);
    }
    audioPaths.push(audioPath);
    db.updateShot(shot.id, { audio_path: audioPath });
  }
  console.log(`========== TTS 音频生成完成 ==========\n`);

  // 2. 生成分段视频 (20-70%) - 仅当启用 AI 视频时
  const shotVideoPaths = [];
  if (enableAiVideo) {
    console.log(`\n========== 开始生成分段视频 ==========`);
    const videoDir = `${shotVideoRoot}/project_${projectId}`;

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const shotIndex = shot.display_index || shot.index || (i + 1);
      const videoPath = `${videoDir}/shot_${shotIndex}.mp4`;

      const videoProgress = 20 + Math.round((i / shots.length) * 50);
      renderJobs.set(taskId, {
        stage: 'video',
        percent: videoProgress,
        message: `生成视频 ${i + 1}/${shots.length}`,
      });

      // 检查图片是否存在
      if (!shot.image_path || !fs.existsSync(shot.image_path)) {
        console.log(`  ✗ 跳过镜头 ${shotIndex}: 图片不存在`);
        shotVideoPaths.push(null);
        continue;
      }

      // 获取该分镜的语音时长
      const audioDuration = await getAudioDuration(audioPaths[i]);
      console.log(`  镜头 ${shotIndex} 语音时长: ${audioDuration.toFixed(2)}秒`);

      // 检查视频是否已存在
      if (fs.existsSync(videoPath)) {
        console.log(`  ○ 跳过已存在的视频: ${videoPath}`);
        shotVideoPaths.push(videoPath);
        db.updateShot(shot.id, { video_path: videoPath, video_status: 'completed' });
        continue;
      }

      try {
        // 生成视频 prompt
        let videoPrompt = shot.video_prompt;
        if (!videoPrompt) {
          console.log(`  → 生成视频 Prompt...`);
          videoPrompt = await promptGen.generateForShot(shot, project.image_style, project.theme);
          db.updateShot(shot.id, { video_prompt: videoPrompt });
        }

        // 根据语音时长计算视频帧数
        // frames 取值范围：[29, 289]，必须满足 25 + 4n 格式
        // 使用 Math.ceil 向上取整，确保视频时长 >= 音频时长，避免视频提前结束导致闪烁
        const minFrames = 29;
        const maxFrames = 289;
        const targetFrames = audioDuration * 24;
        const n = Math.ceil((targetFrames - 25) / 4);
        let frames = 25 + 4 * Math.max(1, n);
        frames = Math.max(minFrames, Math.min(maxFrames, frames));

        const videoDuration = frames / 24;

        console.log(`  → 生成视频 ${shotIndex} (音频: ${audioDuration.toFixed(2)}s → 视频: ${videoDuration.toFixed(3)}s): ${videoPrompt.substring(0, 50)}...`);
        db.updateShot(shot.id, { video_status: 'generating' });

        await videoGen.generate(shot.image_path, videoPrompt, videoPath, {
          audioDuration: videoDuration
        });
        shotVideoPaths.push(videoPath);

        db.updateShot(shot.id, { video_path: videoPath, video_status: 'completed' });
        console.log(`  ✓ 已保存: ${videoPath}`);
      } catch (err) {
        console.error(`  ✗ 视频生成失败: ${err.message}`);
        shotVideoPaths.push(null);
        db.updateShot(shot.id, { video_status: 'failed' });
      }
    }
    console.log(`========== 分段视频生成完成 ==========\n`);
  }

  // 3. 准备 Remotion props (70-75%)
  renderJobs.set(taskId, { stage: 'render', percent: 70, message: '准备渲染...' });

  const fps = config.remotion?.fps || 24;
  const remotionShots = await buildRemotionShots(shots, audioPaths, shotVideoPaths, fps, enableAiVideo);

  console.log(`\n========== Remotion 场景数据 ==========`);
  console.log(`总场景数: ${remotionShots.length}`);
  remotionShots.forEach((shot, i) => {
    console.log(`  场景 ${i + 1}: index=${shot.index}, duration=${shot.durationInFrames}帧 (${(shot.durationInFrames / fps).toFixed(2)}秒)`);
    console.log(`    图片: ${shot.imageUrl}`);
    console.log(`    音频: ${shot.audioUrl}`);
  });
  console.log(`========================================\n`);

  const videoEffects = config.video_effects || {};
  const audioEffects = config.audio_effects || {};

  const props = buildRemotionProps(remotionShots, fps, project, videoEffects, audioEffects);

  console.log(`\n========== Remotion Props ==========`);
  console.log(`视频尺寸: ${props.width}x${props.height}`);
  console.log(`帧率: ${props.fps} fps`);
  console.log(`场景数量: ${props.shots.length}`);
  console.log(`Ken Burns: ${props.enableKenBurns}`);
  console.log(`字幕: ${props.enableSubtitle}`);
  console.log(`BGM: ${props.enableBgm}`);
  console.log(`====================================\n`);

  // 3. 渲染视频
  const outputPath = path.join(videoRoot, `project_${projectId}.mp4`);
  await renderVideo(props, outputPath, taskId);

  // 4. 更新数据库
  db.updateProject(projectId, { status: 'rendered', video_path: outputPath });
  renderJobs.delete(taskId);
}

// 获取音频时长
async function getAudioDuration(audioPath) {
  try {
    // 使用 ffprobe 获取真实音频时长
    const ffprobePath = 'C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin/ffprobe.exe';
    const cmd = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' }).trim();
    const duration = parseFloat(result);
    console.log(`  音频时长 (ffprobe): ${duration.toFixed(2)}秒`);
    if (!isNaN(duration) && duration > 0) {
      return duration;
    }
  } catch (err) {
    console.warn(`ffprobe 获取音频时长失败: ${err.message}`);
  }

  // 降级方案：按文件大小估算
  const stats = fs.statSync(audioPath);
  const bitrate = 128000; // 128kbps
  return (stats.size * 8) / bitrate;
}

// 构建 Remotion shots
async function buildRemotionShots(shots, audioPaths, videoPaths, fps, useVideo) {
  const result = [];
  const config = getConfig();
  const serverUrl = config.remotion?.server_url || 'http://127.0.0.1:3001';

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const audioDuration = await getAudioDuration(audioPaths[i]);
    const shotIndex = shot.display_index || shot.index || (i + 1);

    // 使用 HTTP URL 而不是 file:// URL
    const imageUrl = `${serverUrl}/${shot.image_path.replace(/\\/g, '/')}`;
    const audioUrl = `${serverUrl}/${audioPaths[i].replace(/\\/g, '/')}`;

    // 视频 URL 和时长
    let videoUrl = null;
    let videoDurationInFrames = null;

    if (useVideo && videoPaths[i] && fs.existsSync(videoPaths[i])) {
      videoUrl = `${serverUrl}/${videoPaths[i].replace(/\\/g, '/')}`;

      // 获取视频实际时长
      try {
        const videoMeta = await getVideoMetadata(videoPaths[i]);
        videoDurationInFrames = Math.ceil(videoMeta.durationInSeconds * fps);
        console.log(`  视频 ${shotIndex} 时长: ${videoMeta.durationInSeconds.toFixed(2)}秒 (${videoDurationInFrames}帧)`);
      } catch (err) {
        console.warn(`  无法获取视频 ${shotIndex} 时长: ${err.message}`);
      }
    }

    // 场景时长：有视频时使用视频时长，否则使用音频时长
    const durationInFrames = videoDurationInFrames || Math.ceil(audioDuration * fps);

    result.push({
      index: shotIndex,
      scriptText: shot.script_text,
      imageUrl: imageUrl,
      videoUrl: videoUrl,
      audioUrl: audioUrl,
      durationInFrames: durationInFrames,
    });
  }
  return result;
}

// 构建 Remotion props
function buildRemotionProps(shots, fps, project, videoEffects, audioEffects) {
  const aspectRatio = project.aspect_ratio || '16:9';
  const [width, height] = getResolution(aspectRatio);
  const config = getConfig();
  const serverUrl = config.remotion?.server_url || 'http://127.0.0.1:3001';

  // Resolve project-level config regardless of whether we receive the parsed object or JSON string
  const projectConfig = (() => {
    if (project.config && typeof project.config === 'object') {
      return project.config;
    }
    if (typeof project.config_json === 'string') {
      try {
        return JSON.parse(project.config_json);
      } catch (err) {
        console.warn('Failed to parse project.config_json, falling back to empty config:', err.message);
      }
    }
    return project.config_json || {};
  })();

  // Use project config first, fallback to videoEffects config (which is from config.toml), default to true
  let enableSubtitle = true;

  if (projectConfig.enable_subtitle !== undefined) {
    enableSubtitle = projectConfig.enable_subtitle;
  } else if (videoEffects.enable_subtitle !== undefined) {
    enableSubtitle = videoEffects.enable_subtitle;
  }

  // Normalize legacy project audio configs so both `audio_effects` and the older
  // `audio_effects_config` (or even top-level `enable_bgm`) are honored.
  const projectAudioEffects =
    projectConfig.audio_effects ||
    projectConfig.audio_effects_config ||
    {};

  // BGM: Use project config first, fallback to config.toml, default to true
  let enableBgm = true;
  if (projectConfig.enable_bgm !== undefined) {
    enableBgm = projectConfig.enable_bgm;
  } else if (projectAudioEffects.enable_bgm !== undefined) {
    enableBgm = projectAudioEffects.enable_bgm;
  } else if (audioEffects.enable_bgm !== undefined) {
    enableBgm = audioEffects.enable_bgm;
  }

  // BGM volume: Use project config first, fallback to config.toml
  let bgmVolume = 0.2;
  if (projectAudioEffects.bgm_volume !== undefined) {
    bgmVolume = projectAudioEffects.bgm_volume;
  } else if (audioEffects.bgm_volume !== undefined) {
    bgmVolume = audioEffects.bgm_volume;
  }

  console.log('[buildRemotionProps] BGM resolution', {
    projectId: project.id,
    projectEnableBgm: projectConfig.enable_bgm,
    projectAudioEffects: projectAudioEffects,
    resolvedEnableBgm: enableBgm,
    resolvedVolume: bgmVolume,
    globalEnableBgm: audioEffects.enable_bgm,
    globalVolume: audioEffects.bgm_volume,
  });

  return {
    shots,
    fps,
    width,
    height,
    enableKenBurns: videoEffects.enable_movement || false,
    kenBurnsType: videoEffects.movement_type || 'random',
    zoomRatio: videoEffects.zoom_ratio || 1.12,
    panRange: videoEffects.pan_x_range || 50,
    enableSubtitle: enableSubtitle,
    subtitlePosition: 'bottom',
    subtitleFontSize: 60,
    subtitleStrokeWidth: 6,
    enableBgm: enableBgm,
    bgmUrl: audioEffects.bgm_path ? `${serverUrl}/${audioEffects.bgm_path.replace(/\\/g, '/')}` : '',
    bgmVolume: bgmVolume,
    bgmFadeIn: audioEffects.bgm_fadein || 2,
    bgmFadeOut: audioEffects.bgm_fadeout || 3,
    transitionDuration: 0.5,
  };
}

// 获取分辨率
function getResolution(aspectRatio) {
  const map = {
    '16:9': [1920, 1080],
    '9:16': [1080, 1920],
    '4:3': [1440, 1080],
    '1:1': [1080, 1080],
  };
  return map[aspectRatio] || [1920, 1080];
}

// 渲染视频
async function renderVideo(props, outputPath, taskId) {
  // 确保输出目录存在
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 打包
  renderJobs.set(taskId, { stage: 'render', percent: 50, message: '打包中...' });
  const bundled = await bundle({
    entryPoint: path.join(__dirname, '../../src/index.ts'),
    webpackOverride: (config) => config,
  });

  // 选择 composition
  renderJobs.set(taskId, { stage: 'render', percent: 55, message: '准备渲染...' });
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'VideoComposition',
    inputProps: props,
  });

  // 渲染
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: props,
    onProgress: ({ progress }) => {
      renderJobs.set(taskId, {
        stage: 'render',
        percent: 55 + Math.round(progress * 45),
        message: `渲染中 ${Math.round(progress * 100)}%`,
      });
    },
  });
}

export default router;
