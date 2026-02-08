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
    return `你是一个专业的抖音爆款短视频分镜脚本创作者。请严格按照以下规则创作：

## 爆款抖音文案的 7 个硬性要求

### 1️⃣ 前 3 秒必须"钩人"
开头要制造不适 / 好奇 / 危机感 / 利益点，例：
- ❌「大家好，今天给大家分享…」
- ✅「99%的人都做错了这件事」
- ✅「你是不是也这样…」

### 2️⃣ 只讲一个点
聚焦一个痛点讲透，不要贪多

### 3️⃣ 用"人话"，不用"专业话"
越口语越像在"吐槽/聊天/讲真心话"

### 4️⃣ 文案必须有情绪
高互动情绪：愤怒、焦虑、共鸣，反差
公式：现象 + 情绪 + 立场

### 5️⃣ 有明确的"你"
用"你"而不是"大家/我们"，对着某一类人说话

### 6️⃣ 必须"引导互动"
结尾加互动钩子：「你认同吗？」、「你家是不是也这样？」、「评论区告诉我」

### 7️⃣ 结尾给一个"轻动作"
关注/评论/系列引导

## 主题信息
主题：${theme}
叙事风格：${style || '温暖治愈'}
最大镜头数：${sceneCount}
画面风格：**${imageStyle || '电影感，体积光'}**（保持此风格不变）

## 图片提示词要求
画面要丰富充实，包含以下元素：
1. **场景环境**：具体的地点、背景布置、道具陈设
2. **人物描述**：外貌特征、穿着打扮、表情神态、姿态动作
3. **光影氛围**：光线方向、明暗对比、色彩冷暖
4. **细节元素**：场景中的物体、植物、装饰品等

提示词要用英文，描述要详细具体，让AI能生成内容丰富的画面。

## 输出要求
请根据内容自行决定合适的镜头数量（1-${sceneCount}个），不要凑数，每个镜头都要有实质内容。

请输出 JSON 格式，包含 shots 数组，每个元素包含：
- index: 分镜序号（从1开始）
- script_text: 旁白文案（严格控制在18字以内！必须口语化、有情绪、带"你"字）
- image_prompt: 英文画面描述（**画面要丰富**，包含场景、人物、光影、细节等，用英文逗号分隔）

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

画面风格：**${imageStyle || '电影感，体积光'}**（保持此风格不变）

## 图片提示词要求
画面要丰富充实，包含以下元素：
1. **场景环境**：具体的地点、背景布置、道具陈设
2. **人物描述**：外貌特征、穿着打扮、表情神态、姿态动作
3. **光影氛围**：光线方向、明暗对比、色彩冷暖
4. **细节元素**：场景中的物体、植物、装饰品等

提示词要用英文，描述要详细具体，让AI能生成内容丰富的画面。

请输出 JSON 格式，包含 shots 数组，每个元素包含：
- index: 分镜序号（从1开始）
- script_text: 旁白文案（直接使用我提供的原文，不要修改）
- image_prompt: 英文画面描述（**画面要丰富**，包含场景、人物、光影、细节等，用英文逗号分隔）

只输出 JSON，不要其他内容。`;
  }
}
