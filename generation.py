import json
from typing import Any, Dict, List, Optional

import httpx


class StoryboardGenerator:
    """Use existing文本模型生成剧本、分镜和图片提示词。"""

    def __init__(self, volcengine_config: Dict[str, Any]):
        self.api_url = volcengine_config.get("api_url")
        self.api_key = volcengine_config.get("api_key")
        self.model = volcengine_config.get("model")
        if not self.api_url or not self.api_key or not self.model:
            raise ValueError("volcengine 配置不完整，无法生成分镜。")

    def _request(self, prompt: str, temperature: float = 0.35) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt,
                        }
                    ],
                }
            ],
            "temperature": temperature,
        }
        with httpx.Client(timeout=90.0) as client:
            response = client.post(self.api_url, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()
        message = result.get("choices", [{}])[0].get("message", {})
        content = message.get("content", "")
        # API 可能以数组形式返回
        if isinstance(content, list):
            text_parts = [part.get("text", "") for part in content if isinstance(part, dict)]
            content = "\n".join(text_parts)
        return content.strip()

    def generate_insight(
        self,
        theme: str,
        style: Optional[str] = None
    ) -> str:
        """针对主题生成社会洞察分析，优化短视频平台完播率"""
        style_hint = f"，整体风格偏向：{style}" if style else ""
        prompt = f"""
# Role: 抖音/TikTok 爆款短视频文案专家

# Task:
请根据我提供的主题，撰写一段适合短视频平台的文案{style_hint}。

# 短视频平台核心法则:
1. **黄金3秒开头**：第一句话必须是"钩子"，用悬念、反常识、情绪冲击或直接利益点抓住观众
   - 好的开头示例："你知道吗？90%的人都在犯这个错误"、"千万别这样做，否则..."、"我花了3年才明白这个道理"
   - 避免平淡开头如："今天我想聊聊..."、"大家好..."
2. **节奏紧凑**：每句话都要有信息量，删除所有废话和过渡词
3. **情绪起伏**：文案要有情绪波动，不能一直平铺直叙
4. **金句收尾**：结尾要有记忆点，让人想点赞或评论

# Style Constraints:
1. 叙事结构：[震撼开头/悬念] -> [故事/案例] -> [反转/洞察] -> [金句结尾]
2. 语言风格：口语化、直白、有力量感。避免书面语和文绉绉的表达
3. 语气调性：像朋友在跟你分享一个重要发现，真诚但有态度
4. 句子长度：每句控制在15字以内，便于配音节奏

# Input Theme: [{theme}]

# Output Format:
- 总字数 200-280 字（适合 40-60 秒短视频）
- 段落层次分明，每段 2-3 句话
- 第一句必须是能让人停下来的"钩子"
"""
        raw_text = self._request(prompt)
        raw_text = raw_text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.lstrip("`")
            raw_text = raw_text.strip("`")

        try:
            return raw_text
        except json.JSONDecodeError:
            # 返回空数据而不是抛出异常，允许流程继续
            return ""

    def generate_storyboard(
        self,
        *,
        theme: str,
        style: str,
        scene_count: Optional[int] = None,
        image_style: str,
        negative_prompt_hint: str,
        insight: Optional[str] = None,
    ) -> Dict[str, Any]:
        # 构建场景数量指引
        if scene_count:
            scene_guidance = f"（建议不超过 {scene_count} 个镜头）"
        else:
            scene_guidance = "（建议 3-15 个镜头，根据内容复杂度自定）"

        context = insight.strip() if insight else ""

        prompt = f"""
你是抖音/TikTok 爆款短视频编导，请围绕以下内容设计分镜脚本。
<context>{context}</context>

## 短视频分镜核心原则
1. **第一个镜头是生死线**：开头3秒决定用户去留，第一句旁白必须是"钩子"
2. **节奏曲线**：快起-展开-高潮-收尾，避免平铺直叙
3. **每个镜头3-6秒**：信息密度要高，不要拖沓

## 分镜设计要求
1. 镜头数量{scene_guidance}，根据内容紧凑安排
2. 旁白为口语化中文，每句不超过20字
3. 画面提示词要具体、有视觉冲击力，继承风格：{image_style}
4. 负面提示词基于模板 `{negative_prompt_hint}` 补充

## 输出格式(JSON)
不允许使用 markdown 代码块：
{{"title": "吸引眼球的标题（带数字或疑问更佳）",
  "voice_tone": "旁白情绪",
  "shots": [
    {{"index": 1, "script": "钩子开头", "image_prompt": "画面提示词", "negative_prompt": "负面提示"}}
  ]
}}
"""
        raw_text = self._request(prompt)
        raw_text = raw_text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.lstrip("`")
            raw_text = raw_text.strip("`")

        data = json.loads(raw_text)
        shots = data.get("shots", [])

        parsed_shots: List[Dict[str, Any]] = []
        for idx, shot in enumerate(shots, start=1):
            parsed_shots.append(
                {
                    "index": shot.get("index", idx),
                    "script": shot.get("script", "").strip(),
                    "image_prompt": shot.get("image_prompt", "").strip(),
                    "negative_prompt": shot.get("negative_prompt", negative_prompt_hint).strip(),
                }
            )

        # 验证至少生成了一个镜头
        if not parsed_shots:
            raise ValueError("LLM 未生成任何镜头，请重试")

        actual_count = len(parsed_shots)
        # 注意：这里需要导入 logger，或者移除这行日志
        # import logging
        # logger = logging.getLogger(__name__)
        # logger.info(f"LLM 生成了 {actual_count} 个镜头")

        return {
            "title": data.get("title", theme),
            "voice_tone": data.get("voice_tone", "温和真诚"),
            "shots": parsed_shots,
            "actual_scene_count": actual_count,
        }
