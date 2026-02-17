import { getConfig } from './config.js';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

/**
 * MiniMax Voice Clone Client
 * 文档: https://platform.minimaxi.com/docs/guides/speech-voice-clone
 *
 * 使用流程:
 * 1. 上传待克隆音频 -> 获取 file_id
 * 2. (可选) 上传示例音频 -> 获取 prompt_file_id
 * 3. 调用音色克隆接口 -> 获取 voice_id
 * 4. 使用 voice_id 进行语音合成
 */
export class VoiceCloneClient {
  constructor() {
    const config = getConfig();
    this.ttsConfig = config.minimax_speech || {};
    // 音色克隆使用单独的 API Key（中国国内节点）
    this.apiKey = this.ttsConfig.clone_api_key || this.ttsConfig.api_key;
    this.model = this.ttsConfig.model || 'speech-2.8-hd';

    // MiniMax 文件上传和音色克隆使用 minimaxi.com 域名
    // 文档: https://platform.minimaxi.com/docs/guides/speech-voice-clone
    this.uploadUrl = 'https://api.minimaxi.com/v1/files/upload';
    this.cloneUrl = 'https://api.minimaxi.com/v1/voice_clone';
  }

  /**
   * 上传待克隆的音频文件
   * @param {string} audioPath - 本地音频文件路径
   * @returns {Promise<string>} file_id
   *
   * 音频文件要求:
   * - 格式: mp3, m4a, wav
   * - 时长: 10秒 - 5分钟
   * - 大小: 不超过 20MB
   */
  async uploadCloneAudio(audioPath) {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const stats = fs.statSync(audioPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    // 验证文件大小
    if (fileSizeMB > 20) {
      throw new Error(`Audio file too large: ${fileSizeMB.toFixed(2)}MB (max: 20MB)`);
    }

    // 验证文件格式
    const ext = path.extname(audioPath).toLowerCase();
    const validFormats = ['.mp3', '.m4a', '.wav'];
    if (!validFormats.includes(ext)) {
      throw new Error(`Invalid audio format: ${ext} (supported: ${validFormats.join(', ')})`);
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath));
    formData.append('purpose', 'voice_clone');

    const response = await fetch(this.uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const responseText = await response.text();
    console.log('Upload response:', responseText);

    if (!response.ok) {
      throw new Error(`Upload audio failed: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    const fileId = data.file?.file_id;
    if (!fileId) {
      throw new Error('No file_id returned from upload');
    }

    return fileId;
  }

  /**
   * 上传示例音频（用于增强克隆效果）
   * @param {string} audioPath - 本地音频文件路径
   * @returns {Promise<string>} file_id
   *
   * 音频文件要求:
   * - 格式: mp3, m4a, wav
   * - 时长: 小于 8 秒
   * - 大小: 不超过 20MB
   */
  async uploadPromptAudio(audioPath) {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Prompt audio file not found: ${audioPath}`);
    }

    const stats = fs.statSync(audioPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    // 验证文件大小
    if (fileSizeMB > 20) {
      throw new Error(`Prompt audio file too large: ${fileSizeMB.toFixed(2)}MB (max: 20MB)`);
    }

    // 验证文件格式
    const ext = path.extname(audioPath).toLowerCase();
    const validFormats = ['.mp3', '.m4a', '.wav'];
    if (!validFormats.includes(ext)) {
      throw new Error(`Invalid audio format: ${ext} (supported: ${validFormats.join(', ')})`);
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath));
    formData.append('purpose', 'prompt_audio');

    const response = await fetch(this.uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const responseText = await response.text();
    console.log('Upload prompt response:', responseText);

    if (!response.ok) {
      throw new Error(`Upload prompt audio failed: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    const fileId = data.file?.file_id;
    if (!fileId) {
      throw new Error('No file_id returned from upload');
    }

    return fileId;
  }

  /**
   * 克隆音色
   * @param {Object} options - 克隆选项
   * @param {string} options.file_id - 待克隆音频的 file_id
   * @param {string} options.voice_id - 自定义音色 ID
   * @param {Object} options.clone_prompt - (可选) 示例音频配置
   * @param {string} options.clone_prompt.prompt_audio - 示例音频的 file_id
   * @param {string} options.clone_prompt.prompt_text - 示例音频对应的文本
   * @param {string} options.text - (可选) 试听文本，用于生成试听音频
   * @returns {Promise<Object>} 克隆结果，包含 voice_id 和试听音频（如果提供 text）
   */
  async cloneVoice(options) {
    const { file_id, voice_id, clone_prompt, text } = options;

    if (!file_id) {
      throw new Error('file_id is required');
    }
    if (!voice_id) {
      throw new Error('voice_id is required');
    }

    const payload = {
      file_id,
      voice_id,
      model: this.model,
    };

    if (clone_prompt && clone_prompt.prompt_audio) {
      payload.clone_prompt = {
        prompt_audio: clone_prompt.prompt_audio,
      };
      if (clone_prompt.prompt_text) {
        payload.clone_prompt.prompt_text = clone_prompt.prompt_text;
      }
    }

    if (text) {
      payload.text = text;
    }

    const response = await fetch(this.cloneUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Voice clone failed: ${err}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * 完整克隆流程：上传音频 -> 克隆音色 -> 返回 voice_id
   * @param {string} audioPath - 本地音频文件路径
   * @param {string} customVoiceId - 自定义音色 ID
   * @param {Object} options - 可选参数
   * @param {string} options.promptAudioPath - 示例音频路径
   * @param {string} options.promptText - 示例音频对应的文本
   * @param {string} options.testText - 试听文本
   * @returns {Promise<Object>} { voice_id, audio_hex?, file_id?, prompt_file_id? }
   */
  async cloneFromLocalFile(audioPath, customVoiceId, options = {}) {
    const { promptAudioPath, promptText, testText } = options;

    // 1. 上传待克隆音频
    const fileId = await this.uploadCloneAudio(audioPath);

    const result = {
      file_id: fileId,
    };

    let promptFileId;
    if (promptAudioPath) {
      // 2. 上传示例音频
      promptFileId = await this.uploadPromptAudio(promptAudioPath);
      result.prompt_file_id = promptFileId;
    }

    // 3. 克隆音色
    const clonePrompt = promptFileId ? {
      prompt_audio: promptFileId,
      prompt_text: promptText,
    } : undefined;

    const cloneResult = await this.cloneVoice({
      file_id: fileId,
      voice_id: customVoiceId,
      clone_prompt: clonePrompt,
      text: testText,
    });

    result.voice_id = cloneResult.voice_id || customVoiceId;

    if (cloneResult.audio_hex) {
      result.audio_hex = cloneResult.audio_hex;
    }

    return result;
  }

  /**
   * 从视频文件提取音频并克隆（需要本地安装 ffmpeg）
   * @param {string} videoPath - 本地视频文件路径
   * @param {string} customVoiceId - 自定义音色 ID
   * @param {Object} options - 可选参数
   * @param {string} options.tempAudioPath - 临时音频文件保存路径
   * @param {string} options.promptAudioPath - 示例音频路径
   * @param {string} options.promptText - 示例音频对应的文本
   * @param {string} options.testText - 试听文本
   * @returns {Promise<Object>} { voice_id, audio_hex?, file_id?, temp_audio_path? }
   */
  async cloneFromVideoFile(videoPath, customVoiceId, options = {}) {
    const { execSync } = await import('child_process');
    const os = await import('os');

    const {
      tempAudioPath,
      promptAudioPath,
      promptText,
      testText,
    } = options;

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    // 生成临时音频文件路径
    const tempPath = tempAudioPath || path.join(os.tmpdir(), `voice_clone_${Date.now()}.mp3`);

    try {
      // 使用 ffmpeg 从视频中提取音频
      // 提取前 30 秒音频（确保满足 10 秒最低要求）
      execSync(
        `ffmpeg -y -i "${videoPath}" -t 30 -acodec libmp3lame -ar 32000 -ac 1 "${tempPath}"`,
        { stdio: 'ignore' }
      );
    } catch (error) {
      throw new Error(`Failed to extract audio from video: ${error.message}`);
    }

    // 验证提取的音频
    if (!fs.existsSync(tempPath)) {
      throw new Error('Failed to extract audio from video');
    }

    const result = await this.cloneFromLocalFile(tempPath, customVoiceId, {
      promptAudioPath,
      promptText,
      testText,
    });

    result.temp_audio_path = tempPath;

    return result;
  }

  /**
   * 保存试听音频到本地文件
   * @param {string} audioHex - Base64 编码的音频数据
   * @param {string} outputPath - 输出文件路径
   * @returns {Promise<string>} 输出文件路径
   */
  async saveTestAudio(audioHex, outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, Buffer.from(audioHex, 'hex'));
    return outputPath;
  }
}

/**
 * 便捷函数：从本地音频文件克隆音色
 * @param {string} audioPath - 音频文件路径
 * @param {string} customVoiceId - 自定义音色 ID
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>} 克隆结果
 */
export async function cloneVoiceFromAudio(audioPath, customVoiceId, options = {}) {
  const client = new VoiceCloneClient();
  return await client.cloneFromLocalFile(audioPath, customVoiceId, options);
}

/**
 * 便捷函数：从视频文件克隆音色
 * @param {string} videoPath - 视频文件路径
 * @param {string} customVoiceId - 自定义音色 ID
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>} 克隆结果
 */
export async function cloneVoiceFromVideo(videoPath, customVoiceId, options = {}) {
  const client = new VoiceCloneClient();
  return await client.cloneFromVideoFile(videoPath, customVoiceId, options);
}
