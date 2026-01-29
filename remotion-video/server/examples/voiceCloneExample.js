/**
 * 音色克隆示例脚本
 *
 * 使用方法:
 * node remotion-video/server/examples/voiceCloneExample.js
 *
 * 功能说明:
 * 1. 从本地视频文件克隆音色
 * 2. 从本地音频文件克隆音色
 * 3. 保存试听音频
 */

import { VoiceCloneClient } from '../lib/voiceClone.js';
import { loadConfig } from '../lib/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // 加载配置文件
  const configPath = path.join(__dirname, '../../../config.toml');
  loadConfig(configPath);

  const client = new VoiceCloneClient();

  // 示例 1: 从视频文件克隆音色
  // 注意: 需要本地安装 ffmpeg
  console.log('\n=== 示例 1: 从视频文件克隆音色 ===');

  const videoPath = 'C:\\Users\\Administrator\\Downloads\\Video\\clone-music.mp4';
  const customVoiceId = `my_custom_voice_${Date.now()}`;
  const testText = '你好，这是一个音色克隆测试。';

  // 检查文件是否存在
  if (fs.existsSync(videoPath)) {
    try {
      const result = await client.cloneFromVideoFile(
        videoPath,
        customVoiceId,
        {
          testText: testText,  // 提供试听文本会生成试听音频
        }
      );

      console.log('克隆成功！');
      console.log('Voice ID:', result.voice_id);
      console.log('临时音频文件:', result.temp_audio_path);

      // 如果有试听音频，保存到本地
      if (result.audio_hex) {
        const testAudioPath = path.join(__dirname, '../../assets/audio/voice-clone-test.mp3');
        await client.saveTestAudio(result.audio_hex, testAudioPath);
        console.log('试听音频已保存:', testAudioPath);
      }

      console.log('\n现在可以使用以下 voice_id 进行语音合成:');
      console.log(result.voice_id);

    } catch (error) {
      console.error('克隆失败:', error.message);
    }
  } else {
    console.log(`视频文件不存在: ${videoPath}`);
    console.log('跳过视频克隆示例...');
  }

  // 示例 2: 从音频文件克隆音色
  console.log('\n=== 示例 2: 从音频文件克隆音色 ===');

  // 使用项目中的现有音频文件进行测试
  const audioPath = 'd:/workspace/video_format_demo/assets/audio/narration.mp3';
  const customVoiceId2 = `my_custom_voice_audio_${Date.now()}`;

  try {
    const result = await client.cloneFromLocalFile(
      audioPath,
      customVoiceId2,
      {
        // 可选: 提供示例音频以增强克隆效果
        // promptAudioPath: 'path/to/prompt.mp3',
        // promptText: '这是示例音频的文本',
        testText: '大兄弟，听您口音不是本地人吧。',
      }
    );

    console.log('克隆成功！');
    console.log('Voice ID:', result.voice_id);
    console.log('File ID:', result.file_id);

    if (result.audio_hex) {
      const testAudioPath = path.join(__dirname, '../../assets/audio/voice-clone-test-2.mp3');
      await client.saveTestAudio(result.audio_hex, testAudioPath);
      console.log('试听音频已保存:', testAudioPath);
    } else {
      console.log('未生成试听音频（可能 API 未返回 audio_hex）');
    }

  } catch (error) {
    console.error('克隆失败:', error.message);
  }
}

// 运行示例
main().catch(console.error);
