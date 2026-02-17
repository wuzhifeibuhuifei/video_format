import { getConfig } from './config.js';

/**
 * 视频创作大师 - 为分镜生成动感视频提示词
 */
export class VideoPromptGenerator {
  constructor() {
    const config = getConfig();
    this.apiUrl = config.volcengine?.api_url;
    this.apiKey = config.volcengine?.api_key;
    this.model = config.volcengine?.model || 'deepseek-v3-2-251201';
  }

  /**
   * 为单个分镜生成视频提示词
   * @param {object} shot - 分镜信息
   * @param {string} imageStyle - 图片风格描述
   * @param {string} originalText - 原文/主题
   */
  async generateForShot(shot, imageStyle, originalText) {
    const prompt = this._buildPrompt(shot, imageStyle, originalText);
    return await this._callLLM(prompt);
  }

  /**
   * 批量为所有分镜生成视频提示词
   */
  async generateForAllShots(shots, imageStyle, originalText) {
    const results = [];
    for (const shot of shots) {
      const videoPrompt = await this.generateForShot(shot, imageStyle, originalText);
      results.push({
        shotId: shot.id,
        videoPrompt
      });
    }
    return results;
  }

  _buildPrompt(shot, imageStyle, originalText) {
        return `你是一位专业的"视频创作大师"，擅长将静态分镜画面转化为富有动感和生命力的视频。

## 你的任务
根据以下信息，为这个分镜创作一段视频动作描述（video prompt），用于AI视频生成。

## 输入信息

### 原文/主题
${originalText || '无'}

### 画面风格
${imageStyle || '电影感，高质量'}

### 当前分镜
- 序号：${shot.display_index || shot.index}
- 旁白文案：${shot.script_text || '无'}
- 画面描述：${shot.image_prompt || '无'}

## 创作要求

1. **画面稳定性（最重要）**：
   - 必须保持画面稳定、平滑，避免闪烁和抖动
   - 动作要缓慢、渐进，不要突然变化
   - 优先使用 "smooth", "gentle", "slow", "gradual" 等词汇
   - 必须包含 "smooth motion", "stable camera" 等稳定性描述

2. **风格一致性**：视频风格必须与图片风格保持一致，延续"${imageStyle || '电影感'}"的视觉语言

3. **动作设计**：
   - 只选择一种简单的镜头运动，不要组合多种运动
   - 画面元素的动态要自然、微妙
   - 避免快速移动、闪烁、频繁切换

4. **技术规范**：
   - 使用英文描述
   - 描述要具体、可执行
   - 必须强调 smooth, stable, gentle, slow 等关键词

## 推荐的镜头运动（选择一种）
- very slow zoom in（非常缓慢推进）- 最稳定
- gentle pan left / right（轻柔左右摇镜）
- subtle tilt up / down（微妙上下摇镜）
- static shot with minimal movement（静态镜头带极微动态）- 最安全

## 必须避免
- 快速运动、突然变化
- 多种镜头运动组合
- 闪烁、抖动、跳跃
- dramatic, fast, quick, sudden 等词汇

## 输出格式
只输出英文视频提示词，不要其他内容。提示词应该是一段流畅的描述，50-80个英文单词。
必须以 "Smooth and stable camera movement," 或 "Gentle and steady shot," 开头。`;
  }

  async _callLLM(prompt) {
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
    return content.trim();
  }
}
