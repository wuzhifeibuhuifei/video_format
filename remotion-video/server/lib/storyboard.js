import { getConfig } from './config.js';

export class StoryboardGenerator {
  constructor() {
    const config = getConfig();
    this.apiUrl = config.volcengine?.api_url;
    this.apiKey = config.volcengine?.api_key;
    this.model = config.volcengine?.model || 'deepseek-v3-2-251201';
  }

  async generate(theme, style, sceneCount, imageStyle) {
    const prompt = this.buildPrompt(theme, style, sceneCount, imageStyle);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return this.parseResponse(content);
  }

  buildPrompt(theme, style, sceneCount, imageStyle) {
    return `你是一个专业的短视频分镜脚本创作者。请根据以下要求创作分镜脚本：

主题：${theme}
风格：${style || '温暖治愈'}
分镜数量：${sceneCount}
画面风格：${imageStyle || '电影感，体积光'}

请输出 JSON 格式，包含 shots 数组，每个元素包含：
- index: 分镜序号（从1开始）
- script_text: 旁白文案（20-50字）
- image_prompt: 英文画面描述（用于AI生图）

只输出 JSON，不要其他内容。`;
  }

  parseResponse(content) {
    // 提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse LLM response');
    }
    return JSON.parse(jsonMatch[0]);
  }

  /**
   * 处理自定义文案：按句号拆分，旁白保持原文不变
   * @param {string} customText - 用户输入的自定义文案
   * @param {string} imageStyle - 图片风格
   * @returns {Promise<{shots: Array}>}
   */
  async generateFromCustomText(customText, imageStyle) {
    // 按句号拆分文案（支持中英文句号）
    const sentences = customText
      .split(/[。．.]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (sentences.length === 0) {
      throw new Error('文案内容为空');
    }

    // 为每个分镜生成图片提示词
    const prompt = this.buildCustomTextPrompt(sentences, imageStyle);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const result = this.parseResponse(content);

    // 确保旁白与原文完全一致
    result.shots = result.shots.map((shot, index) => ({
      ...shot,
      index: index + 1,
      script_text: sentences[index] || shot.script_text,
    }));

    return result;
  }

  buildCustomTextPrompt(sentences, imageStyle) {
    const sentenceList = sentences
      .map((s, i) => `${i + 1}. "${s}"`)
      .join('\n');

    return `你是一个专业的短视频分镜脚本创作者。我有以下旁白文案，请为每句话生成对应的画面描述。

旁白文案：
${sentenceList}

画面风格：${imageStyle || '电影感，体积光'}

请输出 JSON 格式，包含 shots 数组，每个元素包含：
- index: 分镜序号（从1开始）
- script_text: 旁白文案（直接使用我提供的原文，不要修改）
- image_prompt: 英文画面描述（用于AI生图，要与旁白内容相匹配）

只输出 JSON，不要其他内容。`;
  }
}
