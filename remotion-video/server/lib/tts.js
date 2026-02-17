import { getConfig } from './config.js';
import fs from 'fs';
import path from 'path';

/**
 * 将毫秒转换为 SRT 时间格式 (HH:MM:SS,mmm)
 */
function msToSrtTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.round(ms % 1000); // 使用 Math.round 避免浮点数精度问题

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * 生成 SRT 格式字幕文件
 * @param {Array} timestamps - 字幕时间戳数组 [{ text, startMs, endMs }]
 * @param {string} outputPath - 输出文件路径
 */
export function generateSrtFile(timestamps, outputPath) {
  if (!timestamps || timestamps.length === 0) {
    console.log('[SRT] 无时间戳数据，跳过生成');
    return null;
  }

  const lines = [];
  timestamps.forEach((ts, index) => {
    lines.push(index + 1);
    lines.push(`${msToSrtTime(ts.startMs)} --> ${msToSrtTime(ts.endMs)}`);
    lines.push(ts.text);
    lines.push('');
  });

  const content = lines.join('\n');

  // 确保目录存在
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, '\ufeff' + content, 'utf8'); // 添加 BOM 以支持中文
  console.log(`[SRT] 已生成字幕文件: ${outputPath}`);
  return outputPath;
}

export class TTSClient {
  constructor() {
    this.refreshConfig();
  }

  refreshConfig() {
    const config = getConfig();
    this.config = config; // 保存完整配置对象
    this.ttsConfig = config.minimax_speech || {};
    this.apiUrl = this.ttsConfig.api_url;
    this.apiKey = this.ttsConfig.api_key || '';
    this.model = this.ttsConfig.model || 'speech-2.6-hd';
    this.voiceSetting = this.ttsConfig.voice_setting || {};
    this.audioSetting = this.ttsConfig.audio_setting || {};
  }

  async synthesize(text, outputPath, options = {}) {
    this.refreshConfig();
    const voiceId = options.voice_id || this.voiceSetting.voice_id;
    const speed = options.speed || this.voiceSetting.speed || 1.0;

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        text: text,
        voice_setting: {
          voice_id: voiceId,
          speed: Math.round(speed),
          vol: Math.round(this.voiceSetting.vol || 1),
          pitch: Math.round(this.voiceSetting.pitch || 0),
        },
        audio_setting: {
          sample_rate: this.audioSetting.sample_rate || 32000,
          bitrate: this.audioSetting.bitrate || 128000,
          format: this.audioSetting.format || 'mp3',
          channel: this.audioSetting.channel || 1,
        },
        subtitle_enable: true,
        render_type: "word", // 使用单词级时间戳以获得更高精度
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[TTS] API 请求失败 (${response.status}):`, err);
      throw new Error(`TTS API error: ${err}`);
    }

    const data = await response.json();
    console.log(`[TTS] API 响应:`, JSON.stringify(data).substring(0, 300));

    const audioHex = data.data?.audio;
    if (!audioHex) {
      console.error(`[TTS] API 响应中没有音频数据:`, JSON.stringify(data));
      throw new Error('No audio data returned');
    }

    // 保存音频
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, Buffer.from(audioHex, 'hex'));

    // 提取字幕时间戳（MiniMax API 可能返回 subtitle_file 或 extra_info）
    let subtitleTimestamps = await this._parseSubtitleData(data);

    // 优先使用 Whisper 词级时间戳获取精确的每句时间
    // 比例拆分（_refineTimestampsBySentence）仅在 Whisper 不可用时作为降级方案
    const whisperConfig = this.config.whisper || {};
    let usedWhisper = false;

    if (whisperConfig.enable) {
      console.log('[TTS] 尝试使用 Whisper 生成精确时间戳...');
      const whisperTimestamps = await this._generateWhisperTimestamps(outputPath, text);
      if (whisperTimestamps && whisperTimestamps.length > 0) {
        subtitleTimestamps = whisperTimestamps;
        usedWhisper = true;
        console.log(`[TTS] Whisper 精确时间戳: ${whisperTimestamps.length} 条`);
      } else {
        console.log('[TTS] Whisper 未返回时间戳，回退到 MiniMax + 比例拆分');
      }
    }

    // 仅对 MiniMax 粗粒度时间戳进行按句细分（Whisper 已经是按句的）
    if (!usedWhisper && subtitleTimestamps && subtitleTimestamps.length > 0) {
      subtitleTimestamps = this._refineTimestampsBySentence(subtitleTimestamps);
    }

    // 统一去除尾部标点
    if (subtitleTimestamps && subtitleTimestamps.length > 0) {
      subtitleTimestamps = subtitleTimestamps.map(ts => ({
        ...ts,
        text: ts.text.replace(/[，。！？；、,\.!\?;]+$/g, '').trim(),
      }));
    }

    // 调试日志：TTS 字幕时间戳
    console.log(`[TTS] 音频生成完成: ${outputPath}`);
    console.log(`[TTS] 字幕时间戳:`, {
      hasTimestamps: !!subtitleTimestamps,
      timestampCount: subtitleTimestamps?.length || 0,
    });
    if (subtitleTimestamps && subtitleTimestamps.length > 0) {
      console.log(`[TTS] 时间戳示例:`, subtitleTimestamps.slice(0, 5));
    }

    // 生成字幕文件 (SRT 格式)
    const subtitlePath = outputPath.replace(/\.mp3$/i, '.srt');
    const subtitleFilePath = generateSrtFile(subtitleTimestamps, subtitlePath);

    return { audioPath: outputPath, subtitlePath: subtitleFilePath, subtitleTimestamps };
  }

  /**
   * 使用 Whisper 生成字幕时间戳
   */
  async _generateWhisperTimestamps(audioPath, originalText) {
    try {
      const { WhisperClient } = await import('./whisper.js');
      const whisper = new WhisperClient();

      const whisperResult = await whisper.transcribe(audioPath);
      const whisperConfig = this.config.whisper || {};
      const splitPattern = whisperConfig.split_pattern || 'punctuation';

      const timestamps = whisper.alignWithOriginalText(
        whisperResult,
        originalText,
        splitPattern
      );

      console.log(`[Whisper] 生成了 ${timestamps.length} 条字幕时间戳`);
      return timestamps;
    } catch (err) {
      console.error('[Whisper] 生成时间戳失败:', err.message);
      return null;
    }
  }

  /**
   * 将粗粒度时间戳按标点符号细分为每句一条
   * 使用字符加权模型在段内按比例分配时间
   */
  _refineTimestampsBySentence(timestamps) {
    const result = [];

    for (const ts of timestamps) {
      const sentences = ts.text.split(/(?<=[，。！？；、,\.!\?;])/).filter(s => s.trim().length > 0);

      // 单句或空文本，直接保留
      if (sentences.length <= 1) {
        result.push(ts);
        continue;
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
      const duration = ts.endMs - ts.startMs;
      let currentMs = ts.startMs;

      for (let i = 0; i < sentences.length; i++) {
        const sentenceDuration = (weights[i] / totalWeight) * duration;
        result.push({
          text: sentences[i].replace(/[，。！？；、,\.!\?;]+$/g, '').trim(),
          startMs: currentMs,
          endMs: currentMs + sentenceDuration,
        });
        currentMs += sentenceDuration;
      }

      console.log(`[TTS] 细分段落 "${ts.text.substring(0, 20)}..." → ${sentences.length} 句`);
    }

    return result;
  }

  /**
   * 解析 MiniMax API 返回的字幕时间戳数据
   * 支持多种返回格式：extra_info.subtitle_file / data.subtitle_file
   * 返回格式: [{ text, startMs, endMs }] 或 null
   */
  async _parseSubtitleData(responseData) {
    try {
      // 尝试从不同字段获取字幕数据
      let subtitleRaw =
        responseData.extra_info?.subtitle_file ||
        responseData.data?.subtitle_file ||
        responseData.subtitle_file;

      if (!subtitleRaw) return null;

      // 如果是 URL，需要先获取内容
      if (typeof subtitleRaw === 'string' && subtitleRaw.startsWith('http')) {
        console.log(`[TTS] 正在从 URL 获取字幕: ${subtitleRaw}`);
        try {
          const res = await fetch(subtitleRaw);
          if (res.ok) {
            subtitleRaw = await res.text();
            // 保存原始数据以便调试
            fs.writeFileSync('debug_subtitle_raw.json', subtitleRaw);
            console.log('[TTS] 原始字幕数据已保存到 debug_subtitle_raw.json');
          } else {
            console.warn(`[TTS] 获取字幕 URL 失败: ${res.status}`);
            return null;
          }
        } catch (err) {
          console.warn(`[TTS] 获取字幕 URL 网络错误: ${err.message}`);
          return null;
        }
      }

      // 如果是字符串，尝试解析为 JSON
      const subtitleData = typeof subtitleRaw === 'string'
        ? JSON.parse(subtitleRaw)
        : subtitleRaw;

      console.log(`[TTS] 原始字幕数据:`, JSON.stringify(subtitleData).substring(0, 500));

      // MiniMax 返回格式通常为: { subtitles: [{ text, start_time, end_time }] }
      // 或直接是数组: [{ text, start_time, end_time }]
      const items = Array.isArray(subtitleData)
        ? subtitleData
        : subtitleData.subtitles || subtitleData.words || [];

      if (items.length === 0) return null;

      return items.map(item => ({
        text: item.text || item.word || '',
        startMs: item.time_begin ?? item.start_time ?? item.start ?? item.startMs ?? 0,
        endMs: item.time_end ?? item.end_time ?? item.end ?? item.endMs ?? 0,
      }));
    } catch (err) {
      console.warn('解析字幕时间戳失败:', err.message);
      return null;
    }
  }
}
