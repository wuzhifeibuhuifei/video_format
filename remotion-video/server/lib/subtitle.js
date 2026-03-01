import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const bundledFfmpegDir = path.resolve(__dirname, '../assets/ffmpeg');
const isLinux = process.platform === 'linux';
const bundledFfmpegPath = isLinux ? '/usr/bin/ffmpeg' : path.join(bundledFfmpegDir, 'ffmpeg.exe');
const bundledFfprobePath = isLinux ? '/usr/bin/ffprobe' : path.join(bundledFfmpegDir, 'ffprobe.exe');

// 设置环境变量
process.env.FFMPEG_PATH = bundledFfmpegPath;
process.env.FFPROBE_PATH = bundledFfprobePath;

/**
 * 解析单个 SRT 文件
 */
function parseSrtFile(srtPath) {
  try {
    const content = fs.readFileSync(srtPath, 'utf8');
    const cleanContent = content.replace(/^\ufeff/, '');
    const blocks = cleanContent.trim().split(/\n\s*\n/);
    const timestamps = [];
  let index = 1;

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;

      const timeLine = lines[1];
      const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (!timeMatch) continue;

      const startMs = parseInt(timeMatch[1]) * 3600000 + parseInt(timeMatch[2]) * 60000 + parseInt(timeMatch[3]) * 1000 + parseInt(timeMatch[4]);
      const endMs = parseInt(timeMatch[5]) * 3600000 + parseInt(timeMatch[6]) * 60000 + parseInt(timeMatch[7]) * 1000 + parseInt(timeMatch[8]);

      const text = lines.slice(2).join('\n').trim();

      if (text) {
        timestamps.push({ index: index++, text, startMs, endMs });
      }
    }
    return timestamps;
  } catch (err) {
    console.error(`[mergeSubtitles] 解析失败 ${srtPath}:`, err.message);
    return [];
  }
}

/**
 * 毫秒转 SRT 时间格式
 */
function msToSrtTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.round(ms % 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * 合并多个 SRT 字幕文件
 * @param {Array} subtitlePaths - 字幕文件路径数组
 * @param {number[]} durations - 每个镜头的时长（毫秒）
 * @param {string} outputPath - 输出文件路径
 * @returns {string|null} 合并后的字幕文件路径
 */
export function mergeSubtitleFiles(subtitlePaths, durations, outputPath) {
  if (!subtitlePaths || subtitlePaths.length === 0) {
    console.log('[mergeSubtitles] 无字幕文件，跳过合并');
    return null;
  }

  const allTimestamps = [];
  let globalStartMs = 0;

  for (let i = 0; i < subtitlePaths.length; i++) {
    const srtPath = subtitlePaths[i];
    if (!srtPath || !fs.existsSync(srtPath)) {
      console.log(`[mergeSubtitles] 跳过不存在的文件: ${srtPath}`);
      // 即使没有字幕文件，也需要记录时间偏移
      globalStartMs += durations[i] || 0;
      continue;
    }

    const timestamps = parseSrtFile(srtPath);
    if (timestamps.length === 0) {
      console.log(`[mergeSubtitles] 跳过空字幕文件: ${srtPath}`);
      globalStartMs += durations[i] || 0;
      continue;
    }

    // 调整时间戳的起始时间
    for (const ts of timestamps) {
      allTimestamps.push({
        text: ts.text,
        startMs: globalStartMs + ts.startMs,
        endMs: globalStartMs + ts.endMs,
      });
    }

    console.log(`[mergeSubtitles] 镜头 ${i + 1}: ${timestamps.length} 条字幕，偏移 ${globalStartMs}ms`);

    // 更新全局时间偏移
    globalStartMs += durations[i] || 0;
  }

  if (allTimestamps.length === 0) {
    console.log('[mergeSubtitles] 无有效字幕数据');
    return null;
  }

  // 生成合并后的 SRT 文件
  const lines = [];
  allTimestamps.forEach((ts, index) => {
    lines.push(index + 1);
    lines.push(`${msToSrtTime(ts.startMs)} --> ${msToSrtTime(ts.endMs)}`);
    lines.push(ts.text);
    lines.push('');
  });

  const content = lines.join('\n');
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, '\ufeff' + content, 'utf8');
  console.log(`[mergeSubtitles] 已生成合并字幕文件: ${outputPath}`);
  console.log(`[mergeSubtitles] 共 ${allTimestamps.length} 条字幕，总时长 ${globalStartMs}ms`);

  return outputPath;
}

/**
 * 从合并后的 SRT 文件中查找重点标注文字的时间戳
 * @param {string} mergedSrtPath - 合并后的 SRT 文件路径
 * @param {Array} highlightShots - 包含 highlight_text 的 shot 数组
 * @param {string|null} defaultSfxPath - 系统默认音效的绝对路径（回退用）
 * @returns {Array<{text: string, startMs: number, displayDurationMs: number, sfxPath: string|null}>}
 */
export function findHighlightTimestamps(mergedSrtPath, highlightShots, defaultSfxPath = null) {
  if (!mergedSrtPath || !fs.existsSync(mergedSrtPath)) return [];
  if (!highlightShots || highlightShots.length === 0) return [];

  const timestamps = parseSrtFile(mergedSrtPath);
  if (timestamps.length === 0) return [];

  const stripPunctuation = (s) =>
    s.replace(/[，。！？、；：""''《》【】（）\s,.!?;:'"()\[\]{}·…—\-～~]/g, '');

  const results = [];
  const HIGHLIGHT_DELAY_MS = 300; // 让字幕先出现，重点标注稍后弹出

  for (const shot of highlightShots) {
    if (!shot.highlight_text) continue;

    // 确定该段落使用的音效：自定义 > 系统默认
    const shotSfxPath = shot._resolvedSfxPath || defaultSfxPath;
    const sfxLabel = shotSfxPath
      ? (shot._resolvedSfxPath ? `自定义: ${path.basename(shotSfxPath)}` : `系统默认: ${path.basename(shotSfxPath)}`)
      : '无音效';

    const phrases = shot.highlight_text.split('|').map((p) => p.trim()).filter(Boolean);

    for (const phrase of phrases) {
      let matched = false;

      // Level 1: 精确包含
      for (const ts of timestamps) {
        if (ts.text.includes(phrase)) {
          const triggerMs = ts.startMs + HIGHLIGHT_DELAY_MS;
          results.push({ text: phrase, startMs: triggerMs, displayDurationMs: 2000, sfxPath: shotSfxPath });
          matched = true;
          console.log(`[findHighlightTimestamps] 精确匹配: "${phrase}" → ${triggerMs}ms (原${ts.startMs}ms +${HIGHLIGHT_DELAY_MS}), 音效: ${sfxLabel}`);
          break;
        }
      }
      if (matched) continue;

      // Level 2: 去标点后匹配
      const cleanPhrase = stripPunctuation(phrase);
      if (!cleanPhrase) continue;

      for (const ts of timestamps) {
        if (stripPunctuation(ts.text).includes(cleanPhrase)) {
          const triggerMs = ts.startMs + HIGHLIGHT_DELAY_MS;
          results.push({ text: phrase, startMs: triggerMs, displayDurationMs: 2000, sfxPath: shotSfxPath });
          matched = true;
          console.log(`[findHighlightTimestamps] 去标点匹配: "${phrase}" → ${triggerMs}ms (原${ts.startMs}ms +${HIGHLIGHT_DELAY_MS}), 音效: ${sfxLabel}`);
          break;
        }
      }
      if (matched) continue;

      // Level 3: 跨条目拼接匹配（2-3 条相邻字幕）
      for (let i = 0; i < timestamps.length - 1; i++) {
        const combined2 = stripPunctuation(timestamps[i].text + timestamps[i + 1].text);
        if (combined2.includes(cleanPhrase)) {
          const triggerMs = timestamps[i].startMs + 100;
          const durationMs = timestamps[i + 1].endMs - triggerMs;
          results.push({ text: phrase, startMs: triggerMs, displayDurationMs: durationMs, sfxPath: shotSfxPath });
          matched = true;
          console.log(`[findHighlightTimestamps] 跨条目匹配(2): "${phrase}" → ${triggerMs}ms, 显示${durationMs}ms (至${timestamps[i + 1].endMs}ms), 音效: ${sfxLabel}`);
          break;
        }
        if (i < timestamps.length - 2) {
          const combined3 = stripPunctuation(
            timestamps[i].text + timestamps[i + 1].text + timestamps[i + 2].text
          );
          if (combined3.includes(cleanPhrase)) {
            const triggerMs = timestamps[i].startMs + 100;
            const durationMs = timestamps[i + 2].endMs - triggerMs;
            results.push({ text: phrase, startMs: triggerMs, displayDurationMs: durationMs, sfxPath: shotSfxPath });
            matched = true;
            console.log(`[findHighlightTimestamps] 跨条目匹配(3): "${phrase}" → ${triggerMs}ms, 显示${durationMs}ms (至${timestamps[i + 2].endMs}ms), 音效: ${sfxLabel}`);
            break;
          }
        }
      }

      if (!matched) {
        console.warn(`[findHighlightTimestamps] 未找到匹配的字幕: "${phrase}"`);
      }
    }
  }

  console.log(`[findHighlightTimestamps] 共找到 ${results.length} 个重点标注`);
  return results;
}

/**
 * 烧录字幕 + 重点标注居中显示 + 音效混合
 * 匹配到重点标注的字幕条目移到屏幕居中，其余保持底部
 * 支持 per-highlight 不同音效文件（每个 highlight 可带 sfxPath）
 * 无高亮时回退到 burnSubtitlesToVideo
 */
export async function burnSubtitlesWithHighlights(
  videoPath, srtPath, outputPath, options = {},
  highlights = [], sfxPath = null
) {
  if (!highlights || highlights.length === 0) {
    return burnSubtitlesToVideo(videoPath, srtPath, outputPath, options);
  }

  const { exec } = await import('child_process');
  const {
    fontSize = 40,
    fontColor = '#f6fa00',
    bold = true,
    margin = 30,
    outlineColor = '#000000',
    outline = 2,
    shadow = 0,
  } = options;

  const rgbToBgr = (hex) => {
    const clean = hex.replace('#', '').toUpperCase();
    if (clean.length !== 6) return clean;
    return clean.slice(4, 6) + clean.slice(2, 4) + clean.slice(0, 2);
  };

  const primaryColour = `&H${rgbToBgr(fontColor)}`;
  const outlineColour = `&H${rgbToBgr(outlineColor)}`;

  // --- 拆分 SRT：匹配高亮的条目居中，其余底部 ---
  const allEntries = parseSrtFile(srtPath);
  const stripPunc = (s) =>
    s.replace(/[，。！？、；：""''《》【】（）\s,.!?;:'"()\[\]{}·…—\-～~]/g, '');

  const highlightTexts = highlights.map((h) => h.text);
  const highlightIndices = new Set();
  const centerSrtEntries = []; // 居中字幕：每个高亮一条完整条目

  for (let hi = 0; hi < highlights.length; hi++) {
    const ht = highlightTexts[hi];
    const cleanHt = stripPunc(ht);

    // Level 1: 单条目匹配
    let matched = false;
    for (const entry of allEntries) {
      if (entry.text.includes(ht) || stripPunc(entry.text).includes(cleanHt)) {
        highlightIndices.add(entry.index);
        centerSrtEntries.push({ text: ht, startMs: entry.startMs, endMs: entry.endMs, highlightIdx: hi });
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Level 2: 跨条目匹配 — 只移除文字实际属于高亮的条目
    for (let i = 0; i < allEntries.length - 1; i++) {
      // 先尝试 2 条
      const combined2 = stripPunc(allEntries[i].text + allEntries[i + 1].text);
      if (combined2.includes(cleanHt)) {
        // 逐条检查：条目文字是否是高亮文字的子串
        for (let j = i; j <= i + 1; j++) {
          if (cleanHt.includes(stripPunc(allEntries[j].text))) {
            highlightIndices.add(allEntries[j].index);
          }
        }
        const first = cleanHt.includes(stripPunc(allEntries[i].text)) ? allEntries[i] : allEntries[i + 1];
        const last = allEntries[i + 1];
        centerSrtEntries.push({ text: ht, startMs: first.startMs, endMs: last.endMs, highlightIdx: hi });
        matched = true;
        break;
      }
      // 再尝试 3 条
      if (i < allEntries.length - 2) {
        const combined3 = stripPunc(allEntries[i].text + allEntries[i + 1].text + allEntries[i + 2].text);
        if (combined3.includes(cleanHt)) {
          const relevant = [];
          for (let j = i; j <= i + 2; j++) {
            if (cleanHt.includes(stripPunc(allEntries[j].text))) {
              highlightIndices.add(allEntries[j].index);
              relevant.push(allEntries[j]);
            }
          }
          const first = relevant[0] || allEntries[i];
          const last = relevant[relevant.length - 1] || allEntries[i + 2];
          centerSrtEntries.push({ text: ht, startMs: first.startMs, endMs: last.endMs, highlightIdx: hi });
          matched = true;
          break;
        }
      }
    }
  }

  const normalEntries = allEntries.filter((e) => !highlightIndices.has(e.index));

  console.log(`[burnSubtitlesWithHighlights] 字幕拆分: ${normalEntries.length} 条底部, ${centerSrtEntries.length} 条居中`);

  // 写入临时 SRT 文件
  const srtDir = path.dirname(srtPath);
  const baseName = path.basename(srtPath, '.srt');
  const normalSrtPath = path.join(srtDir, `${baseName}_normal.srt`);
  const centerSrtPath = path.join(srtDir, `${baseName}_center.srt`);

  const writeSrt = (entries, filePath) => {
    const lines = [];
    entries.forEach((e, idx) => {
      lines.push(idx + 1);
      lines.push(`${msToSrtTime(e.startMs)} --> ${msToSrtTime(e.endMs)}`);
      lines.push(e.text);
      lines.push('');
    });
    fs.writeFileSync(filePath, '\ufeff' + lines.join('\n'), 'utf8');
  };

  writeSrt(normalEntries, normalSrtPath);
  // 居中字幕在标点处换行，去掉行尾标点，避免超出屏幕
  const centerWithBreaks = centerSrtEntries.map(e => ({
    ...e,
    text: e.text
      .replace(/([，。！？；、：,\.!\?;:])/g, '$1\x00')   // 标记分割点
      .split('\x00')                                        // 按标记拆分
      .map(seg => seg.replace(/[，。！？；、：,\.!\?;:]$/g, '')) // 去掉每段末尾标点
      .filter(seg => seg.length > 0)                        // 过滤空段
      .join('\\N'),                                         // 用 ASS 换行符拼接
  }));
  writeSrt(centerWithBreaks, centerSrtPath);

  // FFmpeg 路径转义
  const escapeFfmpegPath = (p) =>
    p ? p.replace(/\\/g, '/').replace(/:/g, '\\:') : null;

  const filterNormalPath = escapeFfmpegPath(normalSrtPath);
  const filterCenterPath = escapeFfmpegPath(centerSrtPath);

  // 底部字幕样式
  const bottomStyle = [
    `Fontsize=${fontSize}`,
    `PrimaryColour=${primaryColour}`,
    `OutlineColour=${outlineColour}`,
    `Bold=${bold ? 1 : 0}`,
    `BorderStyle=1`,
    `Outline=${outline}`,
    `Shadow=${shadow}`,
    `MarginV=${margin}`,
  ].join(',');

  // 居中字幕样式（Alignment=10 = SSA v4 编码：屏幕正中，水平居中）
  const centerStyle = [
    `Fontsize=${fontSize}`,
    `PrimaryColour=${primaryColour}`,
    `OutlineColour=${outlineColour}`,
    `Bold=${bold ? 1 : 0}`,
    `BorderStyle=1`,
    `Outline=${outline}`,
    `Shadow=${shadow}`,
    `Alignment=10`,
    `MarginL=0`,
    `MarginR=0`,
    `MarginV=0`,
  ].join(',');

  // 构建视频滤镜链：底部字幕 + 居中字幕
  let vf = '';
  if (normalEntries.length > 0) {
    vf = `subtitles='${filterNormalPath}':force_style='${bottomStyle}'`;
  }
  if (centerSrtEntries.length > 0) {
    const centerFilter = `subtitles='${filterCenterPath}':force_style='${centerStyle}'`;
    vf = vf ? `${vf},${centerFilter}` : centerFilter;
  }

  const cleanup = () => {
    try { fs.unlinkSync(normalSrtPath); } catch (_) {}
    try { fs.unlinkSync(centerSrtPath); } catch (_) {}
  };

  // 收集每个居中字幕条目对应的音效路径（per-highlight sfx → 全局 sfxPath 回退）
  // 同时构建去重的音效文件输入列表
  const sfxInputMap = new Map(); // sfxAbsPath → inputIndex (从 1 开始，0 是视频)
  const centerSfxInfo = []; // 每个 centerSrtEntry 对应的 { inputIdx, delayMs }

  for (const entry of centerSrtEntries) {
    const highlight = highlights[entry.highlightIdx];
    const entrySfxPath = (highlight && highlight.sfxPath) || sfxPath;

    if (entrySfxPath && fs.existsSync(entrySfxPath)) {
      if (!sfxInputMap.has(entrySfxPath)) {
        sfxInputMap.set(entrySfxPath, sfxInputMap.size + 1); // input index starts at 1
      }
      centerSfxInfo.push({ inputIdx: sfxInputMap.get(entrySfxPath), delayMs: entry.startMs });
    } else {
      centerSfxInfo.push(null); // 无音效
    }
  }

  const hasSfx = sfxInputMap.size > 0;

  if (hasSfx) {
    // 构建 FFmpeg 输入参数：-i video -i sfx1 -i sfx2 ...
    const sfxInputArgs = [];
    for (const [sfxFile] of sfxInputMap) {
      sfxInputArgs.push(`-i "${sfxFile}"`);
    }

    const audioFilters = [];
    const sfxLabels = [];

    for (let i = 0; i < centerSfxInfo.length; i++) {
      const info = centerSfxInfo[i];
      if (!info) continue;
      audioFilters.push(`[${info.inputIdx}:a]adelay=${info.delayMs}|${info.delayMs},volume=0.8[sfx${i}]`);
      sfxLabels.push(`[sfx${i}]`);
    }

    if (sfxLabels.length > 0) {
      audioFilters.push(
        `[0:a]${sfxLabels.join('')}amix=inputs=${sfxLabels.length + 1}:duration=first:dropout_transition=0:normalize=0[aout]`
      );

      const filterComplex = `[0:v]${vf}[vout];${audioFilters.join(';')}`;
      const cmd = `"${bundledFfmpegPath}" -i "${videoPath}" ${sfxInputArgs.join(' ')} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -y "${outputPath}"`;

      console.log(`[burnSubtitlesWithHighlights] 执行命令 (${sfxInputMap.size} 个音效文件): ${cmd}`);

      return new Promise((resolve, reject) => {
        const proc = exec(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
        let stderr = '';
        proc.stderr.on('data', (data) => { stderr += data; });
        proc.on('close', (code) => {
          cleanup();
          if (code === 0) {
            console.log(`[burnSubtitlesWithHighlights] 完成: ${outputPath}`);
            resolve(outputPath);
          } else {
            console.error(`[burnSubtitlesWithHighlights] FFmpeg 错误: ${stderr}`);
            reject(new Error(`FFmpeg 字幕+高亮烧录失败: ${stderr}`));
          }
        });
      });
    }
  }

  if (!hasSfx && sfxPath) {
    console.warn(`[burnSubtitlesWithHighlights] 音效文件不存在: ${sfxPath}`);
  }

  const cmd = `"${bundledFfmpegPath}" -i "${videoPath}" -vf "${vf}" -c:a copy -y "${outputPath}"`;
  console.log(`[burnSubtitlesWithHighlights] 执行命令(无音效): ${cmd}`);

  return new Promise((resolve, reject) => {
    const proc = exec(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data; });
    proc.on('close', (code) => {
      cleanup();
      if (code === 0) {
        console.log(`[burnSubtitlesWithHighlights] 完成: ${outputPath}`);
        resolve(outputPath);
      } else {
        console.error(`[burnSubtitlesWithHighlights] FFmpeg 错误: ${stderr}`);
        reject(new Error(`FFmpeg 字幕+高亮烧录失败: ${stderr}`));
      }
    });
  });
}

export async function burnSubtitlesToVideo(videoPath, srtPath, outputPath, options = {}) {
  const {
    fontSize = 40,
    fontColor = '#f6fa00',
    bold = true,
    position = 'bottom', // top, bottom
    margin = 30,
    outlineColor = '#000000',
    outline = 2,
    shadow = 0,
  } = options;

  const { exec } = await import('child_process');

  // ASS 颜色格式为 &HBBGGRR，需要将 #RRGGBB 转换
  const rgbToBgr = (hex) => {
    const clean = hex.replace('#', '').toUpperCase();
    if (clean.length !== 6) return clean;
    return clean.slice(4, 6) + clean.slice(2, 4) + clean.slice(0, 2);
  };

  const primaryColour = `&H${rgbToBgr(fontColor)}`;
  const outlineColour = `&H${rgbToBgr(outlineColor)}`;

  const forceStyle = [
    `Fontsize=${fontSize}`,
    `PrimaryColour=${primaryColour}`,
    `OutlineColour=${outlineColour}`,
    `Bold=${bold ? 1 : 0}`,
    `BorderStyle=1`,
    `Outline=${outline}`,
    `Shadow=${shadow}`,
    `MarginV=${margin}`,
  ].join(',');

  // FFmpeg subtitles 滤镜中路径需要特殊转义：反斜杠→正斜杠，冒号前加反斜杠
  const filterSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  return new Promise((resolve, reject) => {
    // 使用 FFmpeg 烧录字幕
    const cmd = `"${bundledFfmpegPath}" -i "${videoPath}" -vf "subtitles='${filterSrtPath}':force_style='${forceStyle}'" -c:a copy -y "${outputPath}"`;

    console.log(`[burnSubtitles] 执行命令: ${cmd}`);

    const process = exec(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });

    let stderr = '';
    process.stderr.on('data', (data) => {
      stderr += data;
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log(`[burnSubtitles] 字幕烧录完成: ${outputPath}`);
        resolve(outputPath);
      } else {
        console.error(`[burnSubtitles] FFmpeg 错误: ${stderr}`);
        reject(new Error(`FFmpeg 字幕烧录失败: ${stderr}`));
      }
    });
  });
}
