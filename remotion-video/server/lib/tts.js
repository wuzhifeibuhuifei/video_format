import { getConfig } from './config.js';
import fs from 'fs';
import path from 'path';

export class TTSClient {
  constructor() {
    const config = getConfig();
    this.ttsConfig = config.minimax_speech || {};
    this.apiUrl = this.ttsConfig.api_url;
    this.apiKey = this.ttsConfig.api_key;
    this.model = this.ttsConfig.model || 'speech-2.6-hd';
    this.voiceSetting = this.ttsConfig.voice_setting || {};
    this.audioSetting = this.ttsConfig.audio_setting || {};
  }

  async synthesize(text, outputPath, options = {}) {
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
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`TTS API error: ${err}`);
    }

    const data = await response.json();
    const audioHex = data.data?.audio;
    if (!audioHex) {
      throw new Error('No audio data returned');
    }

    // 保存音频
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, Buffer.from(audioHex, 'hex'));

    return outputPath;
  }
}
