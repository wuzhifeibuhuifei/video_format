"""火山引擎文生图 API 客户端

支持两种调用方式：
1. 豆包 API（推荐）- 使用 HTTP API 直接调用
2. CVProcess API（旧版）- 使用 HMAC-SHA256 签名
"""

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.parse import quote

import httpx


class VolcengineImageClient:
    """火山引擎文生图 API 客户端"""

    def __init__(self, config: Dict[str, Any]):
        # 豆包 API 配置（推荐方式）
        self.api_key = config.get("api_key", "")
        self.model_endpoint = config.get("model_endpoint", "")
        self.ark_api_url = "https://ark.cn-beijing.volces.com/api/v3/images/generations"

        # CVProcess API 配置（旧版方式）
        self.access_key = config.get("access_key", "")
        self.secret_key = config.get("secret_key", "")
        self.api_url = config.get("api_url", "https://visual.volcengineapi.com")
        self.model_version = config.get("model_version", "general_v2.0_L")

        # 通用配置
        self.width = config.get("width", 1024)
        self.height = config.get("height", 1024)
        self.scale = config.get("scale", 7.0)
        self.seed = config.get("seed", -1)
        self.ddim_steps = config.get("ddim_steps", 25)
        self.watermark = config.get("watermark", False)

    def _sign(self, method: str, path: str, params: Dict, body: str, timestamp: str) -> Dict[str, str]:
        """生成火山引擎 API 签名"""
        # 规范化请求
        canonical_uri = path
        canonical_querystring = "&".join(
            f"{quote(k, safe='')}={quote(str(v), safe='')}"
            for k, v in sorted(params.items())
        )

        payload_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()

        headers_to_sign = {
            "host": "visual.volcengineapi.com",
            "x-date": timestamp,
            "x-content-sha256": payload_hash,
            "content-type": "application/json",
        }

        signed_headers = ";".join(sorted(headers_to_sign.keys()))
        canonical_headers = "\n".join(
            f"{k}:{v}" for k, v in sorted(headers_to_sign.items())
        ) + "\n"

        canonical_request = "\n".join([
            method,
            canonical_uri,
            canonical_querystring,
            canonical_headers,
            signed_headers,
            payload_hash,
        ])

        # 生成待签名字符串
        date_stamp = timestamp[:8]
        credential_scope = f"{date_stamp}/cn-north-1/cv/request"
        string_to_sign = "\n".join([
            "HMAC-SHA256",
            timestamp,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ])

        # 计算签名
        def sign(key: bytes, msg: str) -> bytes:
            return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

        k_date = sign(self.secret_key.encode("utf-8"), date_stamp)
        k_region = sign(k_date, "cn-north-1")
        k_service = sign(k_region, "cv")
        k_signing = sign(k_service, "request")
        signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

        # 构建 Authorization 头
        authorization = (
            f"HMAC-SHA256 Credential={self.access_key}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )

        return {
            "Host": "visual.volcengineapi.com",
            "X-Date": timestamp,
            "X-Content-Sha256": payload_hash,
            "Content-Type": "application/json",
            "Authorization": authorization,
        }

    def generate_image(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> Optional[bytes]:
        """生成图片，返回图片二进制数据"""
        # 优先使用豆包 API
        if self.api_key and self.model_endpoint:
            return self._generate_with_ark_api(prompt, negative_prompt, width, height)

        # 回退到 CVProcess API
        return self._generate_with_cvprocess(prompt, negative_prompt, width, height)

    def _generate_with_ark_api(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> Optional[bytes]:
        """使用豆包 API 生成图片（HTTP 直接调用）"""
        w = width or self.width
        h = height or self.height

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        payload = {
            "model": self.model_endpoint,
            "prompt": prompt,
            "size": f"{w}x{h}",
            "n": 1,
            "watermark": self.watermark,
        }

        if self.seed >= 0:
            payload["seed"] = self.seed

        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                self.ark_api_url,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            result = response.json()

        # 解析返回结果
        data = result.get("data", [])
        if data and len(data) > 0:
            image_info = data[0]
            # 如果返回 URL
            if "url" in image_info and image_info["url"]:
                with httpx.Client(timeout=60.0) as client:
                    img_response = client.get(image_info["url"])
                    img_response.raise_for_status()
                    return img_response.content
            # 如果返回 base64
            if "b64_json" in image_info and image_info["b64_json"]:
                return base64.b64decode(image_info["b64_json"])

        return None

    def _generate_with_cvprocess(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> Optional[bytes]:
        """使用 CVProcess API 生成图片（旧版方式）"""
        if not self.access_key or not self.secret_key:
            raise ValueError("火山引擎 access_key 和 secret_key 未配置")

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

        body = {
            "req_key": "high_aes_general_v20_L",
            "prompt": prompt,
            "model_version": self.model_version,
            "width": width or self.width,
            "height": height or self.height,
            "scale": self.scale,
            "ddim_steps": self.ddim_steps,
            "return_url": False,
        }

        if negative_prompt:
            body["negative_prompt"] = negative_prompt
        if self.seed >= 0:
            body["seed"] = self.seed

        body_str = json.dumps(body)
        params = {"Action": "CVProcess", "Version": "2022-08-31"}

        headers = self._sign("POST", "/", params, body_str, timestamp)

        url = f"{self.api_url}/?Action=CVProcess&Version=2022-08-31"

        with httpx.Client(timeout=120.0) as client:
            response = client.post(url, headers=headers, content=body_str)
            response.raise_for_status()
            result = response.json()

        if result.get("code") != 10000:
            raise RuntimeError(f"生图失败: {result.get('message', '未知错误')}")

        # 解码 base64 图片
        data = result.get("data", {})
        binary_data = data.get("binary_data_base64", [])
        if binary_data:
            return base64.b64decode(binary_data[0])
        return None
