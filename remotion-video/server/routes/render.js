import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 使用项目内置的 ffmpeg，根据平台选择 Chrome
const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(__dirname, '../../..');
const serverRoot = path.resolve(__dirname, '..');
const bundledFfmpegDir = path.resolve(__dirname, '../assets/ffmpeg');
const isLinux = process.platform === 'linux';

// Linux 使用系统 Chromium，Windows 使用打包的 ffmpeg
const bundledFfmpegPath = isLinux ? '/usr/bin/ffmpeg' : path.join(bundledFfmpegDir, 'ffmpeg.exe');
const bundledFfprobePath = isLinux ? '/usr/bin/ffprobe' : path.join(bundledFfmpegDir, 'ffprobe.exe');

// 根据平台选择内置的 chrome-headless-shell
// Windows: chrome-headless-shell-win64/chrome-headless-shell.exe
// Linux: chrome-headless-shell-linux64/chrome-headless-shell (可通过环境变量覆盖)
const bundledChromeDir = path.resolve(__dirname, '../assets/chrome-headless');
const bundledChromeExecutable = process.env.CHROME_EXECUTABLE_PATH || (isLinux
  ? path.join(bundledChromeDir, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
  : path.join(bundledChromeDir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'));

process.env.FFMPEG_PATH = bundledFfmpegPath;
process.env.FFPROBE_PATH = bundledFfprobePath;
process.env.PATH = isLinux ? `${bundledFfmpegDir}:${process.env.PATH || ''}` : `${bundledFfmpegDir};${process.env.PATH || ''}`;

import { Router } from 'express';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, getVideoMetadata } from '@remotion/renderer';
import { TTSClient } from '../lib/tts.js';
import { VideoGenerator } from '../lib/video.js';
import { VideoPromptGenerator } from '../lib/videoPrompt.js';
import { getConfig } from '../lib/config.js';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { execSync, spawn } from 'child_process';
const router = Router();

// 解析资产文件路径：优先 serverRoot，回退 projectRoot，最后 workspaceRoot
function resolveAssetPath(relativePath) {
  if (!relativePath) return null;
  const normalized = relativePath.replace(/\\/g, '/');
  if (path.isAbsolute(normalized)) return normalized;
  const candidates = [
    path.resolve(serverRoot, normalized),
    path.resolve(projectRoot, normalized),
    path.resolve(workspaceRoot, normalized),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]; // 默认返回 serverRoot 路径
}

/**
 * 解析 SRT 字幕文件
 * @param {string} srtPath - SRT 文件路径
 * @returns {Array} 时间戳数组 [{ text, startMs, endMs }]
 */
function parseSrtFile(srtPath) {
  try {
    const content = fs.readFileSync(srtPath, 'utf8');
    // 移除 BOM
    const cleanContent = content.replace(/^\ufeff/, '');
    const blocks = cleanContent.trim().split(/\n\s*\n/);
    const timestamps = [];

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;

      // 第二行是时间轴: 00:00:00,000 --> 00:00:02,500
      const timeLine = lines[1];
      const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (!timeMatch) continue;

      const startMs = parseInt(timeMatch[1]) * 3600000 + parseInt(timeMatch[2]) * 60000 + parseInt(timeMatch[3]) * 1000 + parseInt(timeMatch[4]);
      const endMs = parseInt(timeMatch[5]) * 3600000 + parseInt(timeMatch[6]) * 60000 + parseInt(timeMatch[7]) * 1000 + parseInt(timeMatch[8]);

      // 第三行及以后是文本
      const text = lines.slice(2).join('\n').trim();

      if (text) {
        timestamps.push({ text, startMs, endMs });
      }
    }

    console.log(`[parseSrtFile] 解析 ${srtPath}: ${timestamps.length} 条字幕`);
    return timestamps;
  } catch (err) {
    console.error(`[parseSrtFile] 解析失败: ${err.message}`);
    return null;
  }
}

let db = null;
let tts = null;
let videoGen = null;
let promptGen = null;
const renderJobs = new Map();

// 构建服务器 URL（不再需要认证，因为静态文件已开放访问）
function resolveServerUrl(cfg) {
  const config = cfg || getConfig();
  const baseUrl = (config.remotion?.server_url || 'http://127.0.0.1:3001').replace(/\/+$/, '');
  return baseUrl;
}

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
      console.error(`[processRender] 渲染失败:`, err);
      renderJobs.set(taskId, { stage: 'error', percent: 0, message: err.message });
    });

    // 返回当前项目状态
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function processRender(projectId, taskId) {
  try {
    const config = getConfig();
    const workflow = config.workflow || {};
    const audioRoot = workflow.audio_root || 'assets/audio/generated';
    const videoRoot = workflow.video_root || 'outputs';
    const shotVideoRoot = 'assets/videos/projects';

    const project = db.getProject(projectId);
    const shots = project.shots || [];

    // 判断项目分类
    const isBookAnalysis = project.category === 'book_analysis';

    // 检查是否启用 AI 视频生成（读书解析模式跳过）
    const volcVideoConfig = config.volcengine_video || {};
    const enableAiVideo = !isBookAnalysis && (volcVideoConfig.enable || false);
    console.log(`项目分类: ${project.category || 'emotion'}, AI 视频生成: enable=${enableAiVideo}`);

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

      // 跳过空文本段落的 TTS 生成
      if (!shot.script_text || shot.script_text.trim() === '') {
        console.log(`[${ttsProgress}%] 跳过空文本段落 ${i + 1}/${shots.length}`);
        audioPaths.push(null);
        continue;
      }

      console.log(`[${ttsProgress}%] 生成语音 ${i + 1}/${shots.length}: ${shot.script_text.substring(0, 20)}...`);

      if (!fs.existsSync(audioPath)) {
        const ttsResult = await tts.synthesize(shot.script_text, audioPath, { voice_id: shot.voice_id });
        console.log(`  ✓ 已保存: ${audioPath}`);
        // 存储字幕时间戳到 metadata_json
        if (ttsResult.subtitleTimestamps) {
          const metadata = { subtitleTimestamps: ttsResult.subtitleTimestamps };
          db.updateShot(shot.id, { metadata_json: JSON.stringify(metadata) });
          console.log(`  ✓ 已保存字幕时间戳: ${ttsResult.subtitleTimestamps.length} 条`);
        }
        // 保存字幕文件路径
        if (ttsResult.subtitlePath) {
          db.updateShot(shot.id, { subtitle_path: ttsResult.subtitlePath });
          console.log(`  ✓ 已保存字幕文件: ${ttsResult.subtitlePath}`);
        }
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
    const remotionShots = await buildRemotionShots(shots, audioPaths, shotVideoPaths, fps, enableAiVideo, isBookAnalysis, project);

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

    const props = await buildRemotionProps(remotionShots, fps, project, videoEffects, audioEffects);

    // 如果启用了字幕，Remotion 不渲染 React 字幕，改用 FFmpeg 烧录
    const shouldBurnSubtitles = props.enableSubtitle;
    if (shouldBurnSubtitles) {
      props.enableSubtitle = false;
    }

    console.log(`\n========== Remotion Props ==========`);
    console.log(`视频尺寸: ${props.width}x${props.height}`);
    console.log(`帧率: ${props.fps} fps`);
    console.log(`场景数量: ${props.shots.length}`);
    console.log(`Ken Burns: ${props.enableKenBurns}`);
    console.log(`字幕: ${props.enableSubtitle} (烧录: ${shouldBurnSubtitles})`);
    console.log(`BGM: ${props.enableBgm}`);
    console.log(`====================================\n`);

    // 3. 渲染视频
    const outputPath = path.join(videoRoot, `project_${projectId}.mp4`);
    await renderVideo(props, outputPath, taskId, 70);

    // 4. 合并字幕文件
    console.log(`\n========== 开始合并字幕文件 ==========`);
    const { mergeSubtitleFiles, findHighlightTimestamps, burnSubtitlesWithHighlights } = await import('../lib/subtitle.js');

    // 收集所有字幕文件和时长
    // 使用 remotionShots 的 durationInFrames（已包含背景视频时长、默认时长、最小时长保护）
    // 同时应用与 VideoComposition activeShots 一致的过滤逻辑
    const subtitlePaths = [];
    const durations = [];

    for (let i = 0; i < remotionShots.length; i++) {
      const rShot = remotionShots[i];
      const shot = shots[i];
      const shotIndex = rShot.index;

      // 读书解析模式：跳过无文字且无独立背景的段落（与 VideoComposition activeShots 一致）
      if (isBookAnalysis) {
        const hasText = !!(rShot.scriptText && rShot.scriptText.trim());
        if (!hasText && !rShot.backgroundUrl) {
          console.log(`[mergeSubtitles] Shot ${shotIndex}: 无文字无背景，跳过`);
          continue;
        }
      }

      // 调试日志
      console.log(`[mergeSubtitles] Shot ${shotIndex}: subtitle_path=${shot.subtitle_path}, duration=${rShot.durationInFrames}帧 (${(rShot.durationInFrames / fps * 1000).toFixed(0)}ms)`);

      const srtPath = shot.subtitle_path
        ? resolveAssetPath(shot.subtitle_path)
        : null;

      // 使用 remotionShots 中已计算好的帧数转换为毫秒
      durations.push(Math.ceil(rShot.durationInFrames / fps * 1000));

      if (srtPath && fs.existsSync(srtPath)) {
        subtitlePaths.push(srtPath);
      } else {
        subtitlePaths.push(null);
      }
    }

    // 合并字幕文件
    const mergedSubtitleRelative = path.join(videoRoot, `project_${projectId}.srt`);
    const mergedSubtitleAbsolute = path.resolve(mergedSubtitleRelative);
    const mergedPath = mergeSubtitleFiles(subtitlePaths, durations, mergedSubtitleAbsolute);

    // 5. 烧录字幕（如果启用）
    let burnedVideoRelative = null;
    if (shouldBurnSubtitles && mergedPath) {
      renderJobs.set(taskId, { stage: 'burn', percent: 92, message: '烧录字幕到视频...' });
      console.log(`\n========== 开始烧录字幕 ==========`);

      const projectConfig = project.config || {};
      const burnOutputRelative = path.join(videoRoot, `project_${projectId}_with_subtitles.mp4`);
      const burnOutputAbsolute = path.resolve(burnOutputRelative);

      const burnOptions = {
        fontSize: projectConfig.subtitle_font_size || 46,
        fontColor: projectConfig.subtitle_color || '#FFFFFF',
        position: 'bottom',
        margin: 30,
      };

      // 收集重点标注并匹配时间戳
      const runtimeConfig = getConfig();
      const sfxRelative = (runtimeConfig.video_effects || {}).highlight_sfx_path;
      const defaultSfxPath = sfxRelative ? resolveAssetPath(sfxRelative) : null;

      // 为每个 shot 解析自定义音效的绝对路径
      const shotsWithSfx = shots.map(s => ({
        ...s,
        _resolvedSfxPath: s.highlight_sfx_path ? resolveAssetPath(s.highlight_sfx_path) : null,
      }));

      const highlights = findHighlightTimestamps(mergedSubtitleAbsolute, shotsWithSfx, defaultSfxPath);

      await burnSubtitlesWithHighlights(
        path.resolve(outputPath),
        mergedSubtitleAbsolute,
        burnOutputAbsolute,
        burnOptions,
        highlights,
        defaultSfxPath
      );

      burnedVideoRelative = burnOutputRelative;
      console.log(`[processRender] 字幕烧录完成: ${burnOutputAbsolute}`);
    }

    // 6. 更新数据库
    db.updateProject(projectId, {
      status: 'rendered',
      video_path: outputPath,
      subtitle_path: mergedPath ? mergedSubtitleRelative : null,
      video_with_subtitles_path: burnedVideoRelative,
    });
    renderJobs.delete(taskId);
    console.log(`[processRender] ========== 渲染流程完成 ==========`);
  } catch (err) {
    console.error(`[processRender] 渲染流程出错:`, err);
    renderJobs.set(taskId, { stage: 'error', percent: 0, message: err.message });
    throw err;
  }
}

// 获取音频时长
async function getAudioDuration(audioPath) {
  // 处理 null 或 undefined 情况
  if (!audioPath) {
    return 0;
  }

  try {
    // 使用 ffprobe 获取真实音频时长
    if (fs.existsSync(bundledFfprobePath)) {
      const cmd = `"${bundledFfprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
      const result = execSync(cmd, { encoding: 'utf-8' }).trim();
      const duration = parseFloat(result);
      console.log(`  音频时长 (ffprobe): ${duration.toFixed(2)}秒`);
      if (!isNaN(duration) && duration > 0) {
        return duration;
      }
    } else {
      console.warn(`ffprobe 不存在: ${bundledFfprobePath}`);
    }
  } catch (err) {
    console.warn(`ffprobe 获取音频时长失败: ${err.message}`);
  }

  // 降级方案：按文件大小估算
  if (fs.existsSync(audioPath)) {
    const stats = fs.statSync(audioPath);
    const bitrate = 128000; // 128kbps
    return (stats.size * 8) / bitrate;
  }

  return 0;
}

// 构建 Remotion shots
async function buildRemotionShots(shots, audioPaths, videoPaths, fps, useVideo, isBookAnalysis, project) {
  const result = [];
  const config = getConfig();
  const serverUrl = resolveServerUrl(config);

  const timing = config.timing || {};
  const defaultDuration = timing.base_duration || 3.0;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const hasAudio = audioPaths[i] && fs.existsSync(audioPaths[i]);
    const audioDuration = hasAudio ? await getAudioDuration(audioPaths[i]) : 0;
    const shotIndex = shot.display_index || shot.index || (i + 1);

    // 读书解析模式下 image_path 可能为空，使用占位
    const imageUrl = shot.image_path
      ? `${serverUrl}/${shot.image_path.replace(/\\/g, '/')}`
      : '';
    const audioUrl = hasAudio
      ? `${serverUrl}/${audioPaths[i].replace(/\\/g, '/')}`
      : '';

    // 视频 URL 和时长
    let videoUrl = null;
    let videoDurationInFrames = null;

    if (useVideo && videoPaths[i] && fs.existsSync(videoPaths[i])) {
      videoUrl = `${serverUrl}/${videoPaths[i].replace(/\\/g, '/')}`;

      try {
        const videoMeta = await getVideoMetadata(videoPaths[i]);
        videoDurationInFrames = Math.ceil(videoMeta.durationInSeconds * fps);
        console.log(`  视频 ${shotIndex} 时长: ${videoMeta.durationInSeconds.toFixed(2)}秒 (${videoDurationInFrames}帧)`);
      } catch (err) {
        console.warn(`  无法获取视频 ${shotIndex} 时长: ${err.message}`);
      }
    }

    // 段落独立背景
    const backgroundUrl = shot.background_path
      ? `${serverUrl}/${shot.background_path.replace(/\\/g, '/')}`
      : undefined;
    const backgroundType = shot.background_type || undefined;

    // 获取视频背景时长（用于空文本段落的时长计算 + 有音频时的循环播放）
    // 优先使用段落独立背景，回退到全局项目背景
    let bgVideoDurationInFrames = null;
    const effectiveBgPath = shot.background_path || project.background_path;
    const effectiveBgType = backgroundType || project.background_type;

    const absoluteBgPath = effectiveBgPath ? resolveAssetPath(effectiveBgPath) : null;
    console.log(`  [DEBUG] 段落 ${shotIndex} effectiveBgType: ${effectiveBgType}, absoluteBgPath: ${absoluteBgPath}, exists: ${absoluteBgPath ? fs.existsSync(absoluteBgPath) : 'N/A'}`);
    if (effectiveBgType === 'video' && absoluteBgPath && fs.existsSync(absoluteBgPath)) {
      try {
        const bgMeta = await getVideoMetadata(absoluteBgPath);
        bgVideoDurationInFrames = Math.ceil(bgMeta.durationInSeconds * fps);
        console.log(`  段落 ${shotIndex} 背景视频时长: ${bgMeta.durationInSeconds.toFixed(2)}秒 (${bgVideoDurationInFrames}帧)`);
      } catch (err) {
        console.warn(`  无法获取段落 ${shotIndex} 背景视频时长: ${err.message}`);
      }
    }

    // 计算时长：有音频用音频，无音频用视频背景时长或默认时长
    let durationInFrames;
    if (hasAudio) {
      durationInFrames = isBookAnalysis
        ? Math.ceil(audioDuration * fps)
        : (videoDurationInFrames || Math.ceil(audioDuration * fps));
    } else {
      durationInFrames = bgVideoDurationInFrames || Math.ceil(defaultDuration * fps);
      console.log(`  段落 ${shotIndex} 无音频，使用时长: ${durationInFrames}帧`);
    }

    // 最小时长保护：确保段落不会被转场效果吞没
    // 最小时长 = 转场帧数 * 3（前后转场 + 可见内容）
    const transitionFrames = Math.round(0.5 * fps);
    const minDuration = transitionFrames * 3;
    if (durationInFrames < minDuration) {
      console.log(`  段落 ${shotIndex} 时长过短 (${durationInFrames}帧)，调整为最小时长 ${minDuration}帧`);
      durationInFrames = minDuration;
    }

    // 读取字幕时间戳（优先从字幕文件读取，否则从 metadata_json 读取）
    let subtitleTimestamps;
    try {
      // 优先从字幕文件读取（需要转换为绝对路径）
      const subtitlePath = shot.subtitle_path ? resolveAssetPath(shot.subtitle_path) : null;
      if (subtitlePath && fs.existsSync(subtitlePath)) {
        subtitleTimestamps = parseSrtFile(subtitlePath);
        console.log(`[buildRemotionShots] Shot ${shotIndex} 从字幕文件读取: ${subtitleTimestamps?.length || 0} 条`);
      }

      // 降级到 metadata_json
      if (!subtitleTimestamps || subtitleTimestamps.length === 0) {
        const metadata = shot.metadata_json ? JSON.parse(shot.metadata_json) : {};
        subtitleTimestamps = metadata.subtitleTimestamps || undefined;
        console.log(`[buildRemotionShots] Shot ${shotIndex} 从 metadata_json 读取`);
      }

      // 调试日志：字幕时间戳读取
      console.log(`[buildRemotionShots] Shot ${shotIndex} 字幕时间戳:`, {
        hasSubtitlePath: !!subtitlePath,
        hasMetadataJson: !!shot.metadata_json,
        hasTimestamps: !!subtitleTimestamps,
        timestampCount: subtitleTimestamps?.length || 0,
      });
      if (subtitleTimestamps && subtitleTimestamps.length > 0) {
        console.log(`  时间戳示例:`, subtitleTimestamps.slice(0, 2));
      }
    } catch (err) {
      console.error(`[buildRemotionShots] Shot ${shotIndex} 解析字幕失败:`, err);
      subtitleTimestamps = undefined;
    }

    // 段落自定义重点标注音效
    const highlightSfxUrl = shot.highlight_sfx_path
      ? `${serverUrl}/${shot.highlight_sfx_path.replace(/\\/g, '/')}`
      : undefined;

    result.push({
      index: shotIndex,
      scriptText: (shot.script_text || '').trim(),
      imageUrl,
      videoUrl,
      audioUrl,
      durationInFrames,
      backgroundUrl,
      backgroundType,
      backgroundVideoDurationInFrames: bgVideoDurationInFrames || undefined,
      highlightText: shot.highlight_text || undefined,
      highlightSfxUrl,
      subtitleTimestamps,
    });
  }
  return result;
}

// 构建 Remotion props
async function buildRemotionProps(shots, fps, project, videoEffects, audioEffects) {
  const aspectRatio = project.aspect_ratio || '16:9';
  const [width, height] = getResolution(aspectRatio);
  const config = getConfig();
  const serverUrl = resolveServerUrl(config);

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

  // 读书解析背景 URL
  let backgroundUrl = '';
  let backgroundType = '';
  let backgroundVideoDurationInFrames;
  if (project.category === 'book_analysis' && project.background_path) {
    backgroundUrl = `${serverUrl}/${project.background_path.replace(/\\/g, '/')}`;
    backgroundType = project.background_type || 'image';

    // 全局背景为视频时，获取其原始时长用于循环播放
    if (backgroundType === 'video') {
      const absBgPath = resolveAssetPath(project.background_path);
      console.log(`[buildRemotionProps] 全局背景视频路径: ${absBgPath}, exists: ${absBgPath ? fs.existsSync(absBgPath) : false}`);
      if (absBgPath && fs.existsSync(absBgPath)) {
        // 优先使用 Remotion getVideoMetadata，失败则用 ffprobe 兜底
        try {
          const bgMeta = await getVideoMetadata(absBgPath);
          backgroundVideoDurationInFrames = Math.ceil(bgMeta.durationInSeconds * fps);
          console.log(`[buildRemotionProps] 全局背景视频时长 (remotion): ${bgMeta.durationInSeconds.toFixed(2)}秒 (${backgroundVideoDurationInFrames}帧)`);
        } catch (err) {
          console.warn(`[buildRemotionProps] getVideoMetadata 失败，尝试 ffprobe 兜底: ${err.message}`);
          try {
            const bgDurationSec = await getAudioDuration(absBgPath);
            if (bgDurationSec > 0) {
              backgroundVideoDurationInFrames = Math.ceil(bgDurationSec * fps);
              console.log(`[buildRemotionProps] 全局背景视频时长 (ffprobe): ${bgDurationSec.toFixed(2)}秒 (${backgroundVideoDurationInFrames}帧)`);
            }
          } catch (err2) {
            console.error(`[buildRemotionProps] ffprobe 兜底也失败: ${err2.message}`);
          }
        }
      }
      if (!backgroundVideoDurationInFrames) {
        console.error(`[buildRemotionProps] 警告: 无法获取全局背景视频时长，视频将不会循环播放!`);
      }
    }
  }

  return {
    shots,
    fps,
    width,
    height,
    category: project.category || 'emotion',
    backgroundUrl,
    backgroundType,
    backgroundVideoDurationInFrames,
    enableKenBurns: videoEffects.enable_movement || false,
    kenBurnsType: videoEffects.movement_type || 'random',
    zoomRatio: videoEffects.zoom_ratio || 1.12,
    panRange: videoEffects.pan_x_range || 50,
    enableSubtitle: enableSubtitle,
    subtitlePosition: 'bottom',
    subtitleFontSize: projectConfig.subtitle_font_size || 46,
    subtitleStrokeWidth: 6,
    subtitleColor: projectConfig.subtitle_color || '#FFFFFF',
    enableBgm: enableBgm,
    bgmUrl: audioEffects.bgm_path ? `${serverUrl}/${audioEffects.bgm_path.replace(/\\/g, '/')}` : '',
    bgmVolume: bgmVolume,
    bgmFadeIn: audioEffects.bgm_fadein || 2,
    bgmFadeOut: audioEffects.bgm_fadeout || 3,
    transitionDuration: 0.5,
    highlightSfxUrl: (() => {
      // 全局重点标注音效：优先 config.toml 配置，回退到系统默认音效
      const defaultSfxRelative = 'assets/audio/highlight_sfx.MP3';
      const sfxRelative = videoEffects.highlight_sfx_path || defaultSfxRelative;
      const resolved = resolveAssetPath(sfxRelative);
      if (resolved && fs.existsSync(resolved)) {
        return `${serverUrl}/${sfxRelative.replace(/\\/g, '/')}`;
      }
      return undefined;
    })(),
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
async function renderVideo(props, outputPath, taskId, startPercent = 70) {
  console.log(`[renderVideo] 开始渲染流程`);
  console.log(`[renderVideo] FFMPEG_PATH=${process.env.FFMPEG_PATH}`);
  console.log(`[renderVideo] FFPROBE_PATH=${process.env.FFPROBE_PATH}`);

  const clampPercent = (value) => {
    if (Number.isNaN(value)) {
      return startPercent;
    }
    return Math.min(100, Math.max(startPercent, value));
  };

  const updateRenderProgress = (percent, message) => {
    renderJobs.set(taskId, {
      stage: 'render',
      percent: clampPercent(percent),
      message,
    });
  };

  // 验证 ffmpeg 可用性
  try {
    const { execSync } = await import('child_process');
    const testCmd = `"${process.env.FFMPEG_PATH}" -version`;
    execSync(testCmd, { stdio: 'pipe' });
    console.log(`[renderVideo] ffmpeg 验证成功`);
  } catch (err) {
    console.error(`[renderVideo] ffmpeg 不可用: ${err.message}`);
    throw new Error(`ffmpeg not found at ${process.env.FFMPEG_PATH}`);
  }

  // 确保输出目录存在
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 打包
  updateRenderProgress(startPercent, '打包中...');
  console.log(`[renderVideo] 开始打包...`);

  // 确定 Remotion 入口文件路径
  // Docker 环境使用 REMOTION_PROJECT_DIR 环境变量，本地开发使用相对路径
  const remotionProjectDir = process.env.REMOTION_PROJECT_DIR;
  const entryPoint = remotionProjectDir
    ? path.join(remotionProjectDir, 'src/index.ts')
    : path.join(__dirname, '../../src/index.ts');
  console.log(`[renderVideo] Remotion entryPoint: ${entryPoint}`);

  const bundled = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });
  console.log(`[renderVideo] 打包完成`);
  updateRenderProgress(startPercent + 2, '打包完成');

  const renderPhaseStartPercent = clampPercent(startPercent + 5);
  const renderPhaseRange = Math.max(1, 100 - renderPhaseStartPercent);

  // 选择 composition
  updateRenderProgress(renderPhaseStartPercent, '准备渲染...');
  console.log(`[renderVideo] 选择 composition...`);
  const browserExecutable = bundledChromeExecutable;
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'VideoComposition',
    inputProps: props,
    browserExecutable,
    timeoutInMilliseconds: 120000, // 增加到 2 分钟
  });
  console.log(`[renderVideo] composition: ${composition.id}, duration: ${composition.durationInFrames}帧`);

  // 渲染
  console.log(`[renderVideo] 开始渲染视频到: ${outputPath}`);

  // 配置Chrome临时目录到D盘，避免C盘空间不足
  const tempDir = path.resolve(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: props,
    browserExecutable,
    timeoutInMilliseconds: 300000, // 5 分钟超时
    chromiumOptions: {
      userDataDir: tempDir,
    },
    onProgress: ({ progress }) => {
      console.log(`[renderVideo] 渲染进度: ${(progress * 100).toFixed(1)}%`);
      const percent = clampPercent(
        renderPhaseStartPercent + Math.round(progress * renderPhaseRange)
      );
      renderJobs.set(taskId, {
        stage: 'render',
        percent,
        message: `渲染中 ${Math.round(progress * 100)}%`,
      });
    },
  });
  console.log(`[renderVideo] 渲染完成!`);
}

// 生成字幕并烧录到视频 API
router.post('/:projectId/generate-and-burn-subtitles', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const taskId = `project_${projectId}`;

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const videoFullPath = resolveAssetPath(project.video_path || '');
    if (!project.video_path || !fs.existsSync(videoFullPath)) {
      return res.status(400).json({ error: '视频文件不存在，请先渲染视频' });
    }

    if (renderJobs.has(taskId)) {
      return res.status(409).json({ error: '任务正在进行中' });
    }

    const options = {
      fontSize: req.body.fontSize,
      fontColor: req.body.fontColor,
      position: req.body.position,
    };

    renderJobs.set(taskId, { stage: 'subtitle', percent: 0, message: '准备中...' });

    processGenerateAndBurnSubtitles(projectId, taskId, options).catch(err => {
      console.error(`[generate-and-burn] 失败:`, err);
      renderJobs.set(taskId, { stage: 'error', percent: 0, message: err.message });
    });

    res.json(db.getProject(projectId));
  } catch (err) {
    console.error(`[generate-and-burn] 启动失败:`, err);
    res.status(500).json({ error: err.message });
  }
});

async function processGenerateAndBurnSubtitles(projectId, taskId, options = {}) {
  try {
    const config = getConfig();
    const workflow = config.workflow || {};
    const videoRoot = workflow.video_root || 'outputs';
    const whisperConfig = config.whisper || {};
    const splitPattern = whisperConfig.split_pattern || 'punctuation';
    const fps = config.remotion?.fps || 24;
    const defaultDuration = (config.timing || {}).base_duration || 3.0;
    const minDurationSec = (Math.round(0.5 * fps) * 3) / fps; // 与 buildRemotionShots 一致

    const { WhisperClient } = await import('../lib/whisper.js');
    const { mergeSubtitleFiles, findHighlightTimestamps, burnSubtitlesWithHighlights } = await import('../lib/subtitle.js');
    const { generateSrtFile } = await import('../lib/tts.js');

    const whisper = new WhisperClient();
    const project = db.getProject(projectId);
    const shots = project.shots || [];

    if (shots.length === 0) {
      throw new Error('项目没有分镜');
    }

    // 阶段1: 为缺少字幕的分镜生成字幕 (0-60%)
    console.log(`\n========== 开始生成缺失字幕 ==========`);
    let generatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const shotIndex = shot.display_index || shot.index || (i + 1);
      const percent = Math.round((i / shots.length) * 60);

      renderJobs.set(taskId, {
        stage: 'subtitle',
        percent,
        message: `生成字幕 ${i + 1}/${shots.length}`,
      });

      // 检查是否已有字幕文件
      if (shot.subtitle_path) {
        const existingSrt = resolveAssetPath(shot.subtitle_path);
        if (fs.existsSync(existingSrt)) {
          console.log(`[generate-and-burn] Shot ${shotIndex}: 已有字幕，跳过`);
          skippedCount++;
          continue;
        }
      }

      // 检查音频文件
      if (!shot.audio_path) {
        console.log(`[generate-and-burn] Shot ${shotIndex}: 无音频，跳过`);
        skippedCount++;
        continue;
      }

      const audioPath = resolveAssetPath(shot.audio_path);
      if (!fs.existsSync(audioPath)) {
        console.log(`[generate-and-burn] Shot ${shotIndex}: 音频文件不存在 ${audioPath}，跳过`);
        skippedCount++;
        continue;
      }

      // 检查文本
      if (!shot.script_text || shot.script_text.trim() === '') {
        console.log(`[generate-and-burn] Shot ${shotIndex}: 无文本，跳过`);
        skippedCount++;
        continue;
      }

      // 使用 Whisper 生成字幕
      try {
        console.log(`[generate-and-burn] Shot ${shotIndex}: 开始 Whisper 转录...`);
        const whisperResult = await whisper.transcribe(audioPath);
        let timestamps = whisper.alignWithOriginalText(whisperResult, shot.script_text, splitPattern);

        // 去除尾部标点
        if (timestamps && timestamps.length > 0) {
          timestamps = timestamps.map(ts => ({
            ...ts,
            text: ts.text.replace(/[，。！？；、,\.!\?;]+$/g, '').trim(),
          }));
        }

        // 生成 SRT 文件
        const srtPath = audioPath.replace(/\.mp3$/i, '.srt');
        generateSrtFile(timestamps, srtPath);

        // 更新数据库
        const relativeSrtPath = shot.audio_path.replace(/\\/g, '/').replace(/\.mp3$/i, '.srt');
        db.updateShot(shot.id, { subtitle_path: relativeSrtPath });
        if (timestamps) {
          db.updateShot(shot.id, { metadata_json: JSON.stringify({ subtitleTimestamps: timestamps }) });
        }

        console.log(`[generate-and-burn] Shot ${shotIndex}: 生成 ${timestamps?.length || 0} 条字幕`);
        generatedCount++;
      } catch (err) {
        console.error(`[generate-and-burn] Shot ${shotIndex}: Whisper 失败:`, err.message);
        skippedCount++;
      }
    }

    console.log(`[generate-and-burn] 字幕生成完成: 新生成 ${generatedCount}, 跳过 ${skippedCount}`);

    if (generatedCount === 0 && skippedCount === shots.length) {
      // 检查是否有任何已存在的字幕
      const refreshedProject = db.getProject(projectId);
      const refreshedShots = refreshedProject.shots || [];
      const hasAnySubtitle = refreshedShots.some(s => s.subtitle_path);
      if (!hasAnySubtitle) {
        throw new Error('无法生成任何字幕，请检查音频文件和 Whisper 配置');
      }
    }

    // 阶段2: 合并字幕文件 (60-70%)
    renderJobs.set(taskId, { stage: 'merge', percent: 60, message: '合并字幕文件' });
    console.log(`\n========== 开始合并字幕文件 ==========`);

    const refreshedShots = db.getProject(projectId).shots || [];
    const subtitlePaths = [];
    const durations = [];
    const isBookAnalysis = project.category === 'book_analysis';

    for (let i = 0; i < refreshedShots.length; i++) {
      const shot = refreshedShots[i];

      // 读书解析模式：跳过无文字且无独立背景的段落（与 VideoComposition activeShots 一致）
      if (isBookAnalysis) {
        const hasText = !!(shot.script_text && shot.script_text.trim());
        if (!hasText && !shot.background_path) {
          console.log(`[generate-and-burn] Shot ${i + 1}: 无文字无背景，跳过`);
          continue;
        }
      }

      const srtPath = shot.subtitle_path
        ? resolveAssetPath(shot.subtitle_path)
        : null;

      if (srtPath && fs.existsSync(srtPath)) {
        subtitlePaths.push(srtPath);
      } else {
        subtitlePaths.push(null);
      }

      // 计算分镜时长（与 buildRemotionShots 逻辑一致）
      let shotDurationSec = 0;
      if (shot.audio_path) {
        const audioFullPath = resolveAssetPath(shot.audio_path);
        if (fs.existsSync(audioFullPath)) {
          shotDurationSec = await getAudioDuration(audioFullPath);
        }
      }

      // 无音频的分镜：使用视频背景时长或配置默认时长
      if (shotDurationSec === 0) {
        const effectiveBgPath = shot.background_path || project.background_path;
        const effectiveBgType = shot.background_type || project.background_type;
        if (effectiveBgType === 'video' && effectiveBgPath) {
          const absBgPath = resolveAssetPath(effectiveBgPath);
          if (absBgPath && fs.existsSync(absBgPath)) {
            try {
              const bgMeta = await getVideoMetadata(absBgPath);
              shotDurationSec = bgMeta.durationInSeconds;
              console.log(`[generate-and-burn] Shot ${i + 1}: 无音频，使用背景视频时长 ${shotDurationSec.toFixed(2)}s`);
            } catch (err) {
              console.warn(`[generate-and-burn] Shot ${i + 1}: getVideoMetadata 失败，尝试 ffprobe: ${err.message}`);
              try {
                shotDurationSec = await getAudioDuration(absBgPath);
              } catch (err2) {
                console.warn(`[generate-and-burn] Shot ${i + 1}: ffprobe 也失败: ${err2.message}`);
              }
            }
          }
        }
        if (shotDurationSec === 0) {
          shotDurationSec = defaultDuration;
          console.log(`[generate-and-burn] Shot ${i + 1}: 无音频无背景视频，使用默认时长 ${defaultDuration}s`);
        }
      }

      // 最小时长保护
      if (shotDurationSec < minDurationSec) {
        shotDurationSec = minDurationSec;
      }

      durations.push(Math.ceil(shotDurationSec * 1000));
    }

    const mergedSrtRelative = path.join(videoRoot, `project_${projectId}.srt`);
    const mergedSrtAbsolute = path.resolve(mergedSrtRelative);
    const mergedPath = mergeSubtitleFiles(subtitlePaths, durations, mergedSrtAbsolute);

    if (!mergedPath) {
      throw new Error('字幕合并失败，无有效字幕数据');
    }

    db.updateProject(projectId, { subtitle_path: mergedSrtRelative });
    console.log(`[generate-and-burn] 合并字幕完成: ${mergedSrtAbsolute}`);

    // 阶段3: 烧录字幕到视频 (70-95%)
    renderJobs.set(taskId, { stage: 'burn', percent: 70, message: '烧录字幕到视频' });
    console.log(`\n========== 开始烧录字幕 ==========`);

    const videoPath = resolveAssetPath(project.video_path);
    const outputRelative = path.join(videoRoot, `project_${projectId}_with_subtitles.mp4`);
    const outputAbsolute = path.resolve(outputRelative);
    const projectConfig = project.config || {};

    const burnOptions = {
      fontSize: options.fontSize || projectConfig.subtitle_font_size || 46,
      fontColor: options.fontColor || projectConfig.subtitle_color || '#FFFFFF',
      position: options.position || 'bottom',
      margin: 30,
    };

    // 收集重点标注并匹配时间戳
    const refreshedShotsForHighlight = db.getProject(projectId).shots || [];
    const runtimeConfig = getConfig();
    const sfxRelative = (runtimeConfig.video_effects || {}).highlight_sfx_path;
    const defaultSfxPath = sfxRelative ? resolveAssetPath(sfxRelative) : null;

    // 为每个 shot 解析自定义音效的绝对路径
    const shotsWithSfx = refreshedShotsForHighlight.map(s => ({
      ...s,
      _resolvedSfxPath: s.highlight_sfx_path ? resolveAssetPath(s.highlight_sfx_path) : null,
    }));

    const highlights = findHighlightTimestamps(mergedSrtAbsolute, shotsWithSfx, defaultSfxPath);

    await burnSubtitlesWithHighlights(
      videoPath,
      mergedSrtAbsolute,
      outputAbsolute,
      burnOptions,
      highlights,
      defaultSfxPath
    );

    db.updateProject(projectId, { video_with_subtitles_path: outputRelative });

    // 完成
    renderJobs.set(taskId, { stage: 'done', percent: 100, message: '完成' });
    console.log(`[generate-and-burn] ========== 全部完成 ==========`);

    // 短暂延迟后清除任务，让前端有机会看到 100%
    setTimeout(() => renderJobs.delete(taskId), 2000);
  } catch (err) {
    console.error(`[generate-and-burn] 流程出错:`, err);
    renderJobs.set(taskId, { stage: 'error', percent: 0, message: err.message });
    // 延迟清除错误状态，让前端有机会检测到错误
    setTimeout(() => renderJobs.delete(taskId), 5000);
  }
}

// 字幕烧录 API
router.post('/:projectId/burn-subtitles', async (req, res) => {
  const projectId = parseInt(req.params.projectId);

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const videoPath = project.video_path;
    const subtitlePath = project.subtitle_path;

    if (!videoPath || !fs.existsSync(resolveAssetPath(videoPath))) {
      return res.status(400).json({ error: '视频文件不存在' });
    }

    if (!subtitlePath || !fs.existsSync(resolveAssetPath(subtitlePath))) {
      return res.status(400).json({ error: '字幕文件不存在' });
    }

    const config = getConfig();
    const videoDir = (config.workflow || {}).video_root || 'outputs';
    const outputPath = path.join(videoDir, `project_${projectId}_with_subtitles.mp4`);

    // 获取字幕样式选项
    const { fontSize, fontColor, position } = req.body;
    const projectConfig = project.config || {};

    const options = {
      fontSize: fontSize || projectConfig.subtitle_font_size || 46,
      fontColor: fontColor || projectConfig.subtitle_color || '#FFFFFF',
      position: position || 'bottom',
      margin: 30,
    };

    console.log(`[burn-subtitles] 开始烧录字幕: ${projectId}`);
    console.log(`[burn-subtitles] 视频: ${videoPath}`);
    console.log(`[burn-subtitles] 字幕: ${subtitlePath}`);
    console.log(`[burn-subtitles] 输出: ${outputPath}`);
    console.log(`[burn-subtitles] 选项:`, options);

    const { burnSubtitlesToVideo } = await import('../lib/subtitle.js');
    const resultPath = await burnSubtitlesToVideo(
      resolveAssetPath(videoPath),
      resolveAssetPath(subtitlePath),
      outputPath,
      options
    );

    // 更新数据库，保存带字幕的视频路径
    // 保留原视频和字幕路径，添加烧录后的视频路径
    const projectUpdate = {
      video_with_subtitles_path: resultPath,
    };
    db.updateProject(projectId, projectUpdate);

    console.log(`[burn-subtitles] 完成: ${resultPath}`);

    res.json({
      success: true,
      videoPath: resultPath,
      originalVideoPath: videoPath,
      subtitlePath: subtitlePath,
    });
  } catch (err) {
    console.error(`[burn-subtitles] 失败:`, err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
