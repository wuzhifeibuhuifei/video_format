import json
from typing import Any, Dict, List

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

    def generate_storyboard(
        self,
        *,
        theme: str,
        style: str,
        scene_count: int,
        image_style: str,
        negative_prompt_hint: str,
    ) -> Dict[str, Any]:
        prompt = f"""
你是资深短视频编导兼视觉设计师，请围绕主题《{theme}》设计旁白剧本与分镜图片提示词。

## 目标
1. 输出 {scene_count} 个镜头，顺序衔接，完整讲述故事。
2. 旁白内容为现代口语中文，语气符合整体风格：{style}。
3. 每个镜头都要给出面向文生图模型的详细提示词，语言可以是中英文混合，并继承全局画面风格：{image_style}。
4. 为每个镜头补充独立的负面提示词，便于 ComfyUI 过滤画面问题，默认可以在模板后追加差异化描述。

## 输出格式(JSON)
不允许使用 markdown 代码块。示例格式：
{{
  "title": "视频标题",
  "voice_tone": "旁白情绪描述",
  "shots": [
    {{
      "index": 1,
      "script": "对应镜头的旁白文本",
      "image_prompt": "结合主题+风格+镜头内容的画面提示词",
      "negative_prompt": "在模板 `{negative_prompt_hint}` 基础上的负向提示"
    }}
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

        if len(parsed_shots) < scene_count:
            # 简单补齐空镜头，避免后续流程报错
            for pad_index in range(len(parsed_shots) + 1, scene_count + 1):
                parsed_shots.append(
                    {
                        "index": pad_index,
                        "script": f"镜头{pad_index}：{theme}",
                        "image_prompt": f"{image_style}, scene {pad_index}",
                        "negative_prompt": negative_prompt_hint,
                    }
                )
        elif len(parsed_shots) > scene_count:
            parsed_shots = parsed_shots[:scene_count]

        return {
            "title": data.get("title", theme),
            "voice_tone": data.get("voice_tone", "温和真诚"),
            "shots": parsed_shots,
        }
