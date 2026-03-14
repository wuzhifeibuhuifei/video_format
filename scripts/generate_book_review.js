import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取配置
function getConfig() {
  const configPath = path.join(__dirname, '../config.toml');
  const configContent = fs.readFileSync(configPath, 'utf-8');

  const apiUrlMatch = configContent.match(/api_url\s*=\s*"([^"]+)"/);
  const apiKeyMatch = configContent.match(/api_key\s*=\s*"([^"]+)"/);
  const modelMatch = configContent.match(/model\s*=\s*"([^"]+)"/);

  return {
    apiUrl: apiUrlMatch?.[1],
    apiKey: apiKeyMatch?.[1],
    model: modelMatch?.[1] || 'deepseek-v3-2-251201'
  };
}

// 系统提示词
const SYSTEM_PROMPT = `请你扮演一个专业的书评作者和深度故事讲述者，模仿以下《纳瓦尔宝典》的核心要点和写作结构写一篇书评。

### 核心要求
这篇书评的重点不是复述书中的观点，而是通过深入挖掘作者本人的经历来解释这些观点是如何形成的。核心论点必须是："他说的每一句话，都是用真实的代价换来的。"

### 写作结构与关键故事点：
1. 开头 (The Hook): 承认这本书已经有太多人介绍过了，然后立即提出新颖角度：比起复述观点，更值得讲的是作者这个人。

2. 核心叙事 (The Trauma): 描述作者的关键创伤事件，包括背景、陷阱、戏剧性转折。必须包含具体时间、地点、金额等细节。

3. 情感冲击点: 生动描写作者的感受，引用原话，强调代价和痛苦。

4. 被封杀与反思 (The Exile & The Insight): 描述后果、关键标签、提炼原则、引出书中金句。

5. 重塑行业 (The Rebirth): 描述专长获得、杠杆使用、连接原则。

6. 长期主义 (The Long Game): 描述投资/成就、连接复利原则、声誉复利、时间跨度。

7. 最终转向 (The Final Pivot): 描述从某个领域转向另一个关注点，关键认知，行动。

8. 结尾总结 (The Conclusion): 总结核心原则（3-5条，使用项目符号），引导读者阅读原书。

### 排版与风格要求
- 文风：叙事性强，冷静而深刻，充满洞察力，如同在讲述一个史诗故事
- 段落：简短段落，每1-3句话就换行，保持极高的可读性
- 节奏：关键故事节点之间使用清晰的段落分隔，确保叙事层次分明
- 总字数：1500-2500字
- 必须引用作者原话（至少2-3处）
- 必须引用书中金句（至少3-4处）`;

// 调用大模型
async function generateReview(bookName, authorName, material) {
  const config = getConfig();

  const userPrompt = `请为《${bookName}》写一篇深度书评。

作者：${authorName}

作者背景素材：
${material}

请严格按照系统提示词中的8段式结构生成书评，确保包含具体的时间、地点、金额等细节，并引用作者原话和书中金句。`;

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8
    })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const bookIndex = args.indexOf('--book');
  const authorIndex = args.indexOf('--author');
  const materialIndex = args.indexOf('--material');

  if (bookIndex === -1 || authorIndex === -1 || materialIndex === -1) {
    console.error('Usage: node generate_book_review.js --book "书名" --author "作者名" --material "素材"');
    process.exit(1);
  }

  const bookName = args[bookIndex + 1];
  const authorName = args[authorIndex + 1];
  const material = args[materialIndex + 1];

  console.log(`正在为《${bookName}》生成书评...`);

  const review = await generateReview(bookName, authorName, material);

  const outputPath = path.join(__dirname, `../_tmp_review_${bookName.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.txt`);
  fs.writeFileSync(outputPath, review, 'utf-8');

  console.log(`\n书评已生成：${outputPath}\n`);
  console.log(review);
}

main().catch(console.error);
