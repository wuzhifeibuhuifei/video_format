import { getConfig } from './config.js';
import fs from 'fs';
import path from 'path';

export class VideoGenerator {
  constructor() {
    const config = getConfig();
    this.volcConfig = config.volcengine_video || {};
    this.enabled = this.volcConfig.enable || false;
    this.apiKey = this.volcConfig.api_key || config.volcengine?.api_key;
    this.modelEndpoint = this.volcConfig.model_endpoint || 'doubao-seedance-1-5-pro-250828';
    this.pollInterval = this.volcConfig.poll_interval || 5000;
    this.maxPollTime = this.volcConfig.max_poll_time || 300000;
  }

  /**
   * 生成视频（图生视频）
   * @param {string} firstFrameImagePath - 首帧图片路径
   * @param {string} prompt - 视频描述提示词
   * @param {string} outputPath - 输出视频路径
   * @param {object} options - 可选参数
   * @param {number} options.frames - 视频帧数（优先级高于 duration），范围 72-288
   * @param {number} options.duration - 视频时长（秒），范围 3-12
   * @param {number} options.seed - 随机种子
   * @returns {Promise<{videoPath: string, lastFrameUrl?: string}>}
   */
  async generate(firstFrameImagePath, prompt, outputPath, options = {}) {
    if (!this.enabled) {
      throw new Error('Video generation not enabled');
    }

    if (!firstFrameImagePath || !fs.existsSync(firstFrameImagePath)) {
      throw new Error(`First frame image not found: ${firstFrameImagePath}`);
    }

    console.log(`\n------ VideoGenerator.generate ------`);
    console.log(`模型: ${this.modelEndpoint}`);
    console.log(`首帧图片: ${firstFrameImagePath}`);
    console.log(`Prompt: ${prompt.substring(0, 60)}...`);
    console.log(`传入参数: duration=${options.duration}, frames=${options.frames}`);

    // 读取首帧图片并转为 base64 data URI
    const imageBuffer = fs.readFileSync(firstFrameImagePath);
    const base64Image = imageBuffer.toString('base64');
    const ext = path.extname(firstFrameImagePath).toLowerCase().slice(1) || 'png';
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    const imageDataUri = `data:image/${mimeType};base64,${base64Image}`;

    // 创建视频生成任务
    const taskId = await this._createTask(imageDataUri, prompt, options);
    console.log(`任务已创建: ${taskId}`);

    // 轮询等待任务完成
    const result = await this._pollTask(taskId);
    console.log(`视频生成完成`);

    // 下载并保存视频
    await this._downloadVideo(result.videoUrl, outputPath);
    console.log(`视频已保存: ${outputPath}`);
    console.log(`--------------------------------------\n`);

    // 返回结果，包含尾帧图片 URL（如果有）
    return {
      videoPath: outputPath,
      lastFrameUrl: result.lastFrameUrl || null,
    };
  }

  /**
   * 创建视频生成任务
   */
  async _createTask(imageDataUri, prompt, options = {}) {
    console.log(`_createTask 收到的 options:`, JSON.stringify(options));

    const requestBody = {
      model: this.modelEndpoint,
      content: [
        {
          type: 'image_url',
          image_url: {
            url: imageDataUri
          }
        },
        {
          type: 'text',
          text: prompt || ''
        }
      ]
    };

    // 视频时长控制：使用 frames 参数（更精确）
    // frames 取值范围：[29, 289]，必须满足 25 + 4n 格式
    if (options.audioDuration !== undefined) {
      // 根据音频时长计算帧数
      const targetFrames = options.audioDuration * 24;
      const frames = this._calculateValidFrames(targetFrames);
      requestBody.frames = frames;
      const actualDuration = frames / 24;
      console.log(`→ 音频时长: ${options.audioDuration.toFixed(2)}s`);
      console.log(`→ 目标帧数: ${targetFrames.toFixed(1)}, 有效帧数: ${frames} (25+4n格式)`);
      console.log(`→ 实际视频时长: ${actualDuration.toFixed(3)}s`);
    } else if (options.frames !== undefined) {
      // 直接使用传入的帧数
      const frames = this._calculateValidFrames(options.frames);
      requestBody.frames = frames;
      console.log(`→ 设置视频帧数: ${frames} (${(frames / 24).toFixed(3)}s)`);
    } else if (options.duration !== undefined) {
      // 根据秒数计算帧数
      const targetFrames = options.duration * 24;
      const frames = this._calculateValidFrames(targetFrames);
      requestBody.frames = frames;
      console.log(`→ 目标时长: ${options.duration}s, 帧数: ${frames} (${(frames / 24).toFixed(3)}s)`);
    } else {
      console.log(`→ 未指定时长参数，使用默认值`);
    }

    // 随机种子
    if (options.seed !== undefined) {
      requestBody.seed = options.seed;
    }

    console.log(`→ 请求体: model=${requestBody.model}, frames=${requestBody.frames}`);

    const response = await fetch(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    console.log(`Create task response status: ${response.status}`);

    if (!response.ok) {
      const err = await response.text();
      console.error(`Create task error: ${err}`);
      throw new Error(`Video API error: ${err}`);
    }

    const data = await response.json();
    const taskId = data.id;

    if (!taskId) {
      console.error('No task ID in response:', JSON.stringify(data).slice(0, 500));
      throw new Error('No task ID returned');
    }

    return taskId;
  }

  /**
   * 轮询任务状态
   */
  async _pollTask(taskId) {
    const startTime = Date.now();

    while (Date.now() - startTime < this.maxPollTime) {
      const response = await fetch(
        `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        const err = await response.text();
        console.error(`Poll task error: ${err}`);
        throw new Error(`Poll task error: ${err}`);
      }

      const data = await response.json();
      const status = data.status;

      console.log(`Task ${taskId} status: ${status}`);

      if (status === 'succeeded') {
        const videoUrl = data.content?.video_url;
        if (!videoUrl) {
          throw new Error('No video URL in completed task');
        }
        // 提取尾帧图片 URL（如果 API 返回）
        const lastFrameUrl = data.content?.last_frame_image || data.content?.last_frame_url || null;
        if (lastFrameUrl) {
          console.log(`Last frame image URL: ${lastFrameUrl}`);
        }
        return { videoUrl, lastFrameUrl, data };
      }

      if (status === 'failed') {
        const errorMsg = data.error?.message || 'Unknown error';
        throw new Error(`Video generation failed: ${errorMsg}`);
      }

      // 等待后继续轮询
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }

    throw new Error(`Video generation timeout after ${this.maxPollTime}ms`);
  }

  /**
   * 计算符合 25 + 4n 格式的有效帧数
   * 取值范围：[29, 289]
   * 使用 Math.ceil 向上取整，确保视频时长 >= 目标时长
   * @param {number} targetFrames - 目标帧数
   * @returns {number} 有效帧数
   */
  _calculateValidFrames(targetFrames) {
    // 范围限制：29-289
    const minFrames = 29;
    const maxFrames = 289;

    // 计算最接近的 25 + 4n 值（向上取整）
    // n = (frames - 25) / 4
    const n = Math.ceil((targetFrames - 25) / 4);
    let frames = 25 + 4 * Math.max(1, n); // n 至少为 1，确保 frames >= 29

    // 确保在有效范围内
    frames = Math.max(minFrames, Math.min(maxFrames, frames));

    return frames;
  }

  /**
   * 下载视频文件
   */
  async _downloadVideo(videoUrl, outputPath) {
    const response = await fetch(videoUrl);

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, Buffer.from(buffer));
  }

  /**
   * 下载尾帧图片
   * @param {string} lastFrameUrl - 尾帧图片 URL
   * @param {string} outputPath - 输出路径
   */
  async downloadLastFrame(lastFrameUrl, outputPath) {
    if (!lastFrameUrl) return null;

    try {
      const response = await fetch(lastFrameUrl);
      if (!response.ok) {
        console.warn(`Failed to download last frame: ${response.status}`);
        return null;
      }

      const buffer = await response.arrayBuffer();
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, Buffer.from(buffer));
      console.log(`Last frame saved to: ${outputPath}`);
      return outputPath;
    } catch (err) {
      console.warn(`Error downloading last frame: ${err.message}`);
      return null;
    }
  }
}
