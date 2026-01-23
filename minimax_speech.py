import time
from pathlib import Path
from typing import Any, Dict, Optional

import httpx


class MiniMaxSpeechClient:
    """Thin wrapper for MiniMax 同步语音合成 HTTP 接口。"""

    def __init__(self, config: Dict[str, Any]):
        self.api_url = config.get("api_url")
        self.api_key = config.get("api_key")
        self.model = config.get("model", "speech-2.6-hd")
        self.default_voice = config.get("voice_setting", {})
        self.default_audio = config.get("audio_setting", {})
        if not self.api_url or not self.api_key:
            raise ValueError("MiniMax 语音 API 配置不完整。")

    def synthesize(
        self,
        *,
        text: str,
        output_path: Path,
        voice_setting: Optional[Dict[str, Any]] = None,
        audio_setting: Optional[Dict[str, Any]] = None,
        extra_options: Optional[Dict[str, Any]] = None,
        max_retries: int = 3,
        retry_delay: float = 5.0,
    ) -> Path:
        payload: Dict[str, Any] = {
            "model": self.model,
            "text": text,
            "stream": False,
            "voice_setting": voice_setting or self.default_voice,
            "audio_setting": audio_setting or self.default_audio,
        }
        if extra_options:
            payload.update(extra_options)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        last_error = None
        for attempt in range(max_retries):
            try:
                with httpx.Client(timeout=120.0) as client:
                    response = client.post(self.api_url, json=payload, headers=headers)
                    response.raise_for_status()
                    data = response.json()

                base_resp = data.get("base_resp", {})
                status_code = base_resp.get("status_code")
                status_msg = base_resp.get("status_msg", "")

                # 速率限制错误，等待后重试
                if status_code != 0 and "rate limit" in status_msg.lower():
                    last_error = RuntimeError(f"MiniMax 语音合成失败: {status_msg}")
                    if attempt < max_retries - 1:
                        wait_time = retry_delay * (attempt + 1)
                        print(f"速率限制，等待 {wait_time} 秒后重试 ({attempt + 1}/{max_retries})...")
                        time.sleep(wait_time)
                        continue
                    raise last_error

                if status_code != 0:
                    raise RuntimeError(f"MiniMax 语音合成失败: {status_msg}")

                audio_payload = data.get("data", {})
                audio_hex = audio_payload.get("audio")
                if not audio_hex:
                    raise RuntimeError("MiniMax 语音接口未返回音频数据。")

                audio_bytes = bytes.fromhex(audio_hex)
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(audio_bytes)
                return output_path

            except httpx.HTTPStatusError as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait_time = retry_delay * (attempt + 1)
                    print(f"HTTP 错误，等待 {wait_time} 秒后重试 ({attempt + 1}/{max_retries})...")
                    time.sleep(wait_time)
                    continue
                raise

        raise last_error or RuntimeError("MiniMax 语音合成失败")
