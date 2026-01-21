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

        with httpx.Client(timeout=120.0) as client:
            response = client.post(self.api_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        base_resp = data.get("base_resp", {})
        if base_resp.get("status_code") != 0:
            raise RuntimeError(f"MiniMax 语音合成失败: {base_resp.get('status_msg')}")

        audio_payload = data.get("data", {})
        audio_hex = audio_payload.get("audio")
        if not audio_hex:
            raise RuntimeError("MiniMax 语音接口未返回音频数据。")

        audio_bytes = bytes.fromhex(audio_hex)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(audio_bytes)
        return output_path
