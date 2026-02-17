import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VoiceCloneClient } from '../lib/voiceClone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
let voiceCloneClient = null;

export function initVoiceRoutes() {
  voiceCloneClient = new VoiceCloneClient();
  return router;
}

/**
 * POST /api/voice/upload-clone-audio
 * 上传待克隆的音频文件
 * Body:
 * - file: 音频文件 (multipart/form-data)
 */
router.post('/upload-clone-audio', async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const uploadedFile = req.files.file;
    const tempDir = path.join(__dirname, '../../temp/voice-clone');

    // 确保临时目录存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPath = path.join(tempDir, `${Date.now()}_${uploadedFile.name}`);
    await uploadedFile.mv(tempPath);

    console.log(`Uploading clone audio: ${tempPath}`);

    const fileId = await voiceCloneClient.uploadCloneAudio(tempPath);

    // 清理临时文件
    fs.unlinkSync(tempPath);

    res.json({ file_id: fileId });
  } catch (err) {
    console.error('Upload clone audio error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/voice/upload-prompt-audio
 * 上传示例音频文件
 * Body:
 * - file: 音频文件 (multipart/form-data)
 */
router.post('/upload-prompt-audio', async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const uploadedFile = req.files.file;
    const tempDir = path.join(__dirname, '../../temp/voice-clone');

    // 确保临时目录存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPath = path.join(tempDir, `${Date.now()}_${uploadedFile.name}`);
    await uploadedFile.mv(tempPath);

    console.log(`Uploading prompt audio: ${tempPath}`);

    const fileId = await voiceCloneClient.uploadPromptAudio(tempPath);

    // 清理临时文件
    fs.unlinkSync(tempPath);

    res.json({ file_id: fileId });
  } catch (err) {
    console.error('Upload prompt audio error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/voice/clone
 * 克隆音色
 * Body:
 * - file_id: 待克隆音频的 file_id
 * - voice_id: 自定义音色 ID
 * - clone_prompt: (可选) 示例音频配置 { prompt_audio, prompt_text }
 * - text: (可选) 试听文本
 */
router.post('/clone', async (req, res) => {
  try {
    const { file_id, voice_id, clone_prompt, text } = req.body;

    if (!file_id) {
      return res.status(400).json({ error: 'file_id is required' });
    }
    if (!voice_id) {
      return res.status(400).json({ error: 'voice_id is required' });
    }

    console.log(`Cloning voice: ${voice_id}`);

    const result = await voiceCloneClient.cloneVoice({
      file_id,
      voice_id,
      clone_prompt,
      text,
    });

    res.json(result);
  } catch (err) {
    console.error('Voice clone error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/voice/clone-from-local
 * 从本地文件克隆音色（完整流程）
 * Body:
 * - audio_path: 本地音频文件路径（或视频文件路径）
 * - voice_id: 自定义音色 ID
 * - is_video: (可选) 是否为视频文件，默认 false
 * - prompt_audio_path: (可选) 示例音频路径
 * - prompt_text: (可选) 示例音频对应的文本
 * - test_text: (可选) 试听文本
 */
router.post('/clone-from-local', async (req, res) => {
  try {
    const {
      audio_path,
      voice_id,
      is_video = false,
      prompt_audio_path,
      prompt_text,
      test_text,
    } = req.body;

    if (!audio_path) {
      return res.status(400).json({ error: 'audio_path is required' });
    }
    if (!voice_id) {
      return res.status(400).json({ error: 'voice_id is required' });
    }

    console.log(`Cloning voice from local: ${audio_path}`);

    let result;
    if (is_video) {
      result = await voiceCloneClient.cloneFromVideoFile(audio_path, voice_id, {
        promptAudioPath: prompt_audio_path,
        promptText: prompt_text,
        testText: test_text,
      });
    } else {
      result = await voiceCloneClient.cloneFromLocalFile(audio_path, voice_id, {
        promptAudioPath: prompt_audio_path,
        promptText: prompt_text,
        testText: test_text,
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Voice clone from local error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/voice/save-test-audio
 * 保存试听音频到本地
 * Body:
 * - audio_hex: Base64 编码的音频数据
 * - output_path: 输出文件路径
 */
router.post('/save-test-audio', async (req, res) => {
  try {
    const { audio_hex, output_path } = req.body;

    if (!audio_hex) {
      return res.status(400).json({ error: 'audio_hex is required' });
    }
    if (!output_path) {
      return res.status(400).json({ error: 'output_path is required' });
    }

    const savedPath = await voiceCloneClient.saveTestAudio(audio_hex, output_path);

    res.json({ path: savedPath });
  } catch (err) {
    console.error('Save test audio error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/voice/voices
 * 获取可用的系统音色列表（调用 MiniMax API）
 * 这需要实现，可以后续添加
 */
router.get('/voices', async (req, res) => {
  // TODO: 实现获取系统音色列表
  res.json({
    voices: [
      {
        voice_id: 'moss_audio_9251a561-fbf8-11f0-a07b-0eec1f98af65',
        name: 'Custom Voice (Default)',
        description: 'Default custom voice from config'
      }
    ]
  });
});

export default router;
