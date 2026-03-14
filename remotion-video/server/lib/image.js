import { getConfig } from './config.js';
import fs from 'fs';
import path from 'path';

export class ImageGenerator {
  constructor() {
    this.refreshConfig();
  }

  refreshConfig() {
    const config = getConfig();
    this.volcConfig = config.volcengine_image || {};
    this.enabled = this.volcConfig.enable || false;
    this.apiKey = this.volcConfig.api_key || config.volcengine?.api_key || '';
    this.modelEndpoint = this.volcConfig.model_endpoint;
  }

  async generate(prompt, outputPath, options = {}) {
    this.refreshConfig();
    if (!this.enabled) {
      throw new Error('Image generation not enabled');
    }

    const width = options.width || this.volcConfig.width || 1920;
    const height = options.height || this.volcConfig.height || 1080;
    const watermark = this.volcConfig.watermark !== undefined ? this.volcConfig.watermark : false;
    const referenceImagePath = options.referenceImage || null;

    console.log(`Calling image API with model: ${this.modelEndpoint}, size: ${width}x${height}, watermark: ${watermark}`);
    if (referenceImagePath) {
      console.log(`Using reference image: ${referenceImagePath}`);
    }

    // 构建请求体
    const requestBody = {
      model: this.modelEndpoint,
      prompt: prompt,
      size: `${width}x${height}`,
      response_format: 'b64_json',
      watermark: watermark,
    };

    // 高分辨率模式（doubao-seedream-4-5 支持）
    if (options.highQuality) {
      requestBody.high_aes_quality_optimize = 1;
    }

    // 如果有参考图片，添加到请求中
    if (referenceImagePath && fs.existsSync(referenceImagePath)) {
      const imageBuffer = fs.readFileSync(referenceImagePath);
      const base64Image = imageBuffer.toString('base64');
      // 火山引擎要求 base64 格式为: data:image/<格式>;base64,<数据>
      const ext = path.extname(referenceImagePath).toLowerCase().slice(1) || 'png';
      const mimeType = ext === 'jpg' ? 'jpeg' : ext;
      const dataUri = `data:image/${mimeType};base64,${base64Image}`;
      requestBody.image = [dataUri];
      // 设置参考图片的权重，控制一致性程度
      requestBody.image_weight = options.imageWeight || 0.5;
    }

    // 调用火山引擎 ARK API
    const response = await fetch(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    console.log(`Image API response status: ${response.status}`);

    if (!response.ok) {
      const err = await response.text();
      console.error(`Image API error response: ${err}`);
      throw new Error(`Image API error: ${err}`);
    }

    const data = await response.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      console.error('No image data in response:', JSON.stringify(data).slice(0, 500));
      throw new Error('No image data returned');
    }

    // 保存图片
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
    console.log(`Image saved to: ${outputPath}`);

    return outputPath;
  }
}
