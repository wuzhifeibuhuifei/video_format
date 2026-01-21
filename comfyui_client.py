import random
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx


class ComfyUIClient:
    """Lightweight client for ComfyUI HTTP API."""

    def __init__(self, config: Dict[str, Any]):
        self.base_url = config.get("base_url", "http://127.0.0.1:8188").rstrip("/")
        self.model_name = config.get("model_name", "z_image_turbo")
        self.width = int(config.get("width", 832))
        self.height = int(config.get("height", 1216))
        self.cfg = float(config.get("cfg", 3.5))
        self.steps = int(config.get("steps", 20))
        self.seed = int(config.get("seed", 1024))
        self.timeout = int(config.get("timeout", 120))
        self.enabled = bool(config.get("enable_auto_generate", False))
        self._http = httpx.Client(timeout=60.0)

    def can_use(self) -> bool:
        return bool(self.base_url and self.model_name)

    def generate_image(
        self,
        *,
        prompt: str,
        negative_prompt: str,
        output_path: Path,
        seed: Optional[int] = None,
    ) -> Path:
        if not self.can_use():
            raise RuntimeError("ComfyUI 未配置或不可用。")

        workflow = self._build_workflow(prompt, negative_prompt, seed)
        resp = self._http.post(f"{self.base_url}/prompt", json={"prompt": workflow})
        resp.raise_for_status()
        prompt_id = resp.json().get("prompt_id")
        if not prompt_id:
            raise RuntimeError("ComfyUI 未返回 prompt_id。")

        images = self._wait_for_result(prompt_id)
        if not images:
            raise RuntimeError("ComfyUI 未生成任何图像。")

        image_info = images[0]
        data = self._download_image(
            filename=image_info["filename"],
            subfolder=image_info.get("subfolder", ""),
            image_type=image_info.get("type", "output"),
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(data)
        return output_path

    def _wait_for_result(self, prompt_id: str) -> List[Dict[str, Any]]:
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            resp = self._http.get(f"{self.base_url}/history/{prompt_id}")
            if resp.status_code == 404:
                time.sleep(1.0)
                continue
            resp.raise_for_status()
            data = resp.json()
            history = data.get("history", {}).get(prompt_id)
            if not history:
                time.sleep(1.0)
                continue

            status = history.get("status", {})
            if status.get("status_str") in {"error", "failed"}:
                raise RuntimeError(status.get("error", "ComfyUI 生成失败"))

            outputs = history.get("outputs", {})
            images = []
            for output in outputs.values():
                images.extend(output.get("images", []))

            if images:
                return images

            time.sleep(1.0)

        raise TimeoutError("等待 ComfyUI 生成图片超时")

    def _download_image(self, *, filename: str, subfolder: str, image_type: str) -> bytes:
        params = {"filename": filename, "subfolder": subfolder, "type": image_type}
        resp = self._http.get(f"{self.base_url}/view", params=params)
        resp.raise_for_status()
        return resp.content

    def _build_workflow(self, prompt: str, negative_prompt: str, seed: Optional[int]) -> Dict[str, Any]:
        actual_seed = seed if seed is not None else random.randint(1, 2**31 - 1)
        workflow = {
            "3": {
                "inputs": {
                    "ckpt_name": self.model_name,
                },
                "class_type": "CheckpointLoaderSimple",
            },
            "4": {
                "inputs": {
                    "text": prompt,
                    "clip": ["3", 1],
                },
                "class_type": "CLIPTextEncode",
            },
            "5": {
                "inputs": {
                    "text": negative_prompt,
                    "clip": ["3", 1],
                },
                "class_type": "CLIPTextEncode",
            },
            "6": {
                "inputs": {
                    "model": ["3", 0],
                    "positive": ["4", 0],
                    "negative": ["5", 0],
                    "latent_image": ["7", 0],
                    "seed": actual_seed,
                    "steps": self.steps,
                    "cfg": self.cfg,
                    "sampler_name": "dpmpp_2m",
                    "scheduler": "karras",
                    "denoise": 1.0,
                },
                "class_type": "KSampler",
            },
            "7": {
                "inputs": {
                    "width": self.width,
                    "height": self.height,
                    "batch_size": 1,
                },
                "class_type": "EmptyLatentImage",
            },
            "8": {
                "inputs": {
                    "samples": ["6", 0],
                    "vae": ["3", 2],
                },
                "class_type": "VAEDecode",
            },
            "9": {
                "inputs": {
                    "filename_prefix": "project",
                    "images": ["8", 0],
                },
                "class_type": "SaveImage",
            },
        }
        return workflow
