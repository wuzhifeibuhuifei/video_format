import { getConfig } from './config.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class JimengImageGenerator {
  constructor() {
    this.refreshConfig();
  }

  refreshConfig() {
    const config = getConfig();
    this.jimengConfig = config.jimeng || {};
    this.enabled = this.jimengConfig.enable || false;
    this.accessKey = this.jimengConfig.access_key || '';
    this.secretKey = this.jimengConfig.secret_key || '';
    this.region = 'cn-north-1';
    this.service = 'cv';
  }

  // 火山引擎签名v4
  sign(method, uri, query, headers, body) {
    const algorithm = 'HMAC-SHA256';
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');

    const credentialScope = `${date}/${this.region}/${this.service}/request`;

    // 规范化请求
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(k => `${k.toLowerCase()}:${headers[k].trim()}\n`)
      .join('');
    const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort().join(';');
    const hashedPayload = crypto.createHash('sha256').update(body).digest('hex');

    const canonicalRequest = [
      method,
      uri,
      query,
      canonicalHeaders,
      signedHeaders,
      hashedPayload
    ].join('\n');

    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');

    // 待签名字符串
    const stringToSign = [
      algorithm,
      datetime,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');

    // 计算签名
    const kDate = crypto.createHmac('sha256', this.secretKey).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(this.service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    return `${algorithm} Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  async submitTask(prompt, options = {}) {
    const body = {
      req_key: 'jimeng_t2i_v30',
      prompt: prompt,
      model_version: options.modelVersion || 'general_v3.0',
      scale: options.scale || 3.5,
      seed: options.seed || -1,
      ddim_steps: options.steps || 25,
      width: options.width || 1024,
      height: options.height || 1024,
      use_sr: options.useSr || false,
      logo_info: {
        add_logo: false,
        position: 0
      }
    };

    const bodyStr = JSON.stringify(body);
    const xDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const headers = {
      'Content-Type': 'application/json',
      'Host': 'visual.volcengineapi.com',
      'X-Date': xDate
    };

    const authorization = this.sign(
      'POST',
      '/',
      'Action=CVSync2AsyncSubmitTask&Version=2022-08-31',
      headers,
      bodyStr
    );

    headers['Authorization'] = authorization;

    const response = await fetch(
      'https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31',
      {
        method: 'POST',
        headers,
        body: bodyStr
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Submit task failed: ${err}`);
    }

    const data = await response.json();
    if (data.code !== 10000) {
      throw new Error(`Submit task error: ${data.message || 'Unknown error'}`);
    }

    return data.data.task_id;
  }

  async getResult(taskId) {
    const body = JSON.stringify({
      task_id: taskId,
      req_key: 'jimeng_t2i_v30'
    });
    const xDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const headers = {
      'Content-Type': 'application/json',
      'Host': 'visual.volcengineapi.com',
      'X-Date': xDate
    };

    const authorization = this.sign(
      'POST',
      '/',
      'Action=CVSync2AsyncGetResult&Version=2022-08-31',
      headers,
      body
    );

    headers['Authorization'] = authorization;

    const response = await fetch(
      'https://visual.volcengineapi.com?Action=CVSync2AsyncGetResult&Version=2022-08-31',
      {
        method: 'POST',
        headers,
        body
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Get result failed: ${err}`);
    }

    const data = await response.json();
    if (data.code !== 10000) {
      throw new Error(`Get result error: ${data.message || 'Unknown error'}`);
    }

    console.log('API response:', JSON.stringify(data, null, 2));
    return data.data;
  }

  async generate(prompt, outputPath, options = {}) {
    this.refreshConfig();
    if (!this.enabled) {
      throw new Error('Jimeng image generation not enabled');
    }

    console.log(`Generating image with Jimeng API: ${prompt}`);

    // 提交任务
    const taskId = await this.submitTask(prompt, options);
    console.log(`Task submitted: ${taskId}`);

    // 轮询结果
    let result;
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      result = await this.getResult(taskId);

      if (result.status === 'done') {
        break;
      } else if (result.status === 'failed') {
        throw new Error('Image generation failed');
      }

      attempts++;
    }

    if (result.status !== 'done') {
      throw new Error('Image generation timeout');
    }

    // 保存图片（从base64或URL）
    let buffer;
    if (result.binary_data_base64 && result.binary_data_base64.length > 0) {
      buffer = Buffer.from(result.binary_data_base64[0], 'base64');
    } else if (result.image_urls && result.image_urls.length > 0) {
      const imageUrl = result.image_urls[0];
      const imageResponse = await fetch(imageUrl);
      buffer = Buffer.from(await imageResponse.arrayBuffer());
    } else {
      throw new Error('No image data in response');
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, Buffer.from(buffer));
    console.log(`Image saved to: ${outputPath}`);

    return outputPath;
  }
}
