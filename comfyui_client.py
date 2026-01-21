"""
ComfyUI Web API 接口客户端
参考 comfyUI_api/comfyui_tool.py 实现，提供 WebSocket 进度监听和更好的错误处理

主要功能:
1. 通过 WebSocket 监听 ComfyUI 生成进度
2. 支持从配置文件或内置 workflow 生成图片
3. 自动保存到指定路径
"""

import json
import random
import time
import uuid
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import websocket


def setup_logger(name: str = "ComfyUIClient") -> logging.Logger:
    """设置并返回一个配置好的 logger"""
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    # 避免重复添加 handler
    if logger.handlers:
        return logger

    # 控制台 handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        fmt='[%(name)s] %(levelname)s: %(message)s'
    )
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    return logger


class ComfyUIClient:
    """
    ComfyUI API 客户端

    功能:
    - 提交绘图任务到 ComfyUI
    - 通过 WebSocket 监听生成进度
    - 自动下载并保存生成的图片
    - 支持超时控制和错误处理
    """

    def __init__(self, config: Dict[str, Any]):
        """
        初始化 ComfyUI 客户端

        Args:
            config: 配置字典，包含:
                - base_url: ComfyUI 服务器地址 (默认: http://127.0.0.1:8188)
                - model_name: 模型名称 (默认: z_image_turbo)
                - width: 图片宽度 (默认: 832)
                - height: 图片高度 (默认: 1216)
                - cfg: CFG 值 (默认: 3.5)
                - steps: 采样步数 (默认: 20)
                - seed: 随机种子 (默认: 1024)
                - timeout: 超时时间秒数 (默认: 120)
                - workflow_file: workflow JSON 文件路径 (可选)
                - enable_auto_generate: 是否启用自动生成 (默认: False)
        """
        self.logger = setup_logger("ComfyUIClient")
        self.logger.info(f"初始化 ComfyUIClient")

        self.base_url = config.get("base_url", "http://127.0.0.1:8188").rstrip("/")
        self.model_name = config.get("model_name", "z_image_turbo")
        self.width = int(config.get("width", 832))
        self.height = int(config.get("height", 1216))
        self.cfg = float(config.get("cfg", 3.5))
        self.steps = int(config.get("steps", 20))
        self.seed = int(config.get("seed", 1024))
        self.timeout = int(config.get("timeout", 120))
        self.workflow_file = config.get("workflow_file")
        self.enabled = bool(config.get("enable_auto_generate", False))

        # 生成唯一的客户端 ID
        self.client_id = str(uuid.uuid4())

        # HTTP 客户端
        self._http = httpx.Client(timeout=60.0)

        self.logger.debug(f"配置: base_url={self.base_url}, model={self.model_name}")
        self.logger.debug(f"尺寸: {self.width}x{self.height}, steps={self.steps}, cfg={self.cfg}")

    def can_use(self) -> bool:
        """检查 ComfyUI 是否可用"""
        return bool(self.base_url and self.model_name)

    def generate_image(
        self,
        *,
        prompt: str,
        negative_prompt: str,
        output_path: Path,
        seed: Optional[int] = None,
        use_websocket: bool = True,
    ) -> Path:
        """
        生成图片并保存到指定路径

        Args:
            prompt: 正面提示词
            negative_prompt: 负面提示词
            output_path: 输出文件路径
            seed: 随机种子 (可选)
            use_websocket: 是否使用 WebSocket 监听进度 (默认: True)

        Returns:
            保存的图片路径
        """
        if not self.can_use():
            raise RuntimeError("ComfyUI 未配置或不可用。")

        self.logger.info(f"开始生成图片 -> {output_path.name}")
        self.logger.debug(f"提示词: {prompt[:80]}...")

        # 构建 workflow
        workflow = self._build_workflow(prompt, negative_prompt, seed)

        # 提交任务
        prompt_id = self._queue_prompt(workflow)
        self.logger.info(f"任务已提交: prompt_id={prompt_id}")

        # 等待结果并获取图片
        if use_websocket:
            images = self._wait_for_result_with_websocket(prompt_id)
        else:
            images = self._wait_for_result_polling(prompt_id)

        if not images:
            raise RuntimeError("ComfyUI 未生成任何图像。")

        # 下载并保存图片
        image_info = images[0]
        data = self._download_image(
            filename=image_info["filename"],
            subfolder=image_info.get("subfolder", ""),
            image_type=image_info.get("type", "output"),
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(data)

        self.logger.info(f"图片已保存: {output_path}")
        return output_path

    def _queue_prompt(self, prompt: Dict[str, Any]) -> str:
        """
        提交绘图任务到队列

        Args:
            prompt: workflow prompt 数据

        Returns:
            prompt_id
        """
        self.logger.debug("提交任务到队列")

        data = json.dumps({"prompt": prompt, "client_id": self.client_id}).encode('utf-8')

        try:
            resp = self._http.post(
                f"{self.base_url}/prompt",
                content=data,
                headers={'Content-Type': 'application/json'}
            )
            resp.raise_for_status()
            result = resp.json()
            prompt_id = result.get('prompt_id')
            if not prompt_id:
                raise RuntimeError("未返回 prompt_id")
            return prompt_id
        except httpx.HTTPError as e:
            self.logger.error(f"提交任务失败: {e}")
            self.logger.error(f"请确认 ComfyUI 服务器是否运行在 {self.base_url}")
            raise

    def _wait_for_result_with_websocket(self, prompt_id: str) -> List[Dict[str, Any]]:
        """
        使用 WebSocket 等待生成结果（实时进度监听）

        Args:
            prompt_id: 任务 ID

        Returns:
            生成的图片信息列表
        """
        self.logger.info("使用 WebSocket 监听生成进度...")

        ws_url = f"ws://{self.base_url.replace('http://', '').replace('https://', '')}/ws?clientId={self.client_id}"

        try:
            ws = websocket.WebSocket()
            ws.connect(ws_url)
            self.logger.debug("WebSocket 连接成功")
        except Exception as e:
            self.logger.warning(f"WebSocket 连接失败，回退到轮询模式: {e}")
            return self._wait_for_result_polling(prompt_id)

        start_time = time.time()
        last_progress_time = start_time
        execution_finished = False

        try:
            while True:
                # 超时检查
                elapsed = time.time() - start_time
                if elapsed > self.timeout:
                    raise TimeoutError(f"生成超时（{self.timeout}秒）")

                try:
                    # 接收消息（设置较短的超时）
                    ws.settimeout(1.0)
                    message = ws.recv()

                    if isinstance(message, str):
                        data = json.loads(message)
                        msg_type = data.get('type')

                        # 进度消息
                        if msg_type == 'progress':
                            progress_data = data.get('data', {})
                            value = progress_data.get('value', 0)
                            max_value = progress_data.get('max', 0)
                            if max_value > 0:
                                progress = value / max_value * 100
                                # 限制打印频率
                                if time.time() - last_progress_time > 0.5:
                                    print(f"\r[ComfyUI] 进度: {value}/{max_value} ({progress:.1f}%)", end='', flush=True)
                                    last_progress_time = time.time()

                        # 执行状态消息
                        elif msg_type == 'executing':
                            exec_data = data.get('data', {})
                            node = exec_data.get('node')
                            if node:
                                self.logger.debug(f"执行节点: {node}")
                            # 当 node 为 None 且 prompt_id 匹配时，表示执行完成
                            if exec_data.get('node') is None and exec_data.get('prompt_id') == prompt_id:
                                print()  # 换行
                                self.logger.info('执行完成')
                                execution_finished = True
                                break

                        # 缓存消息
                        elif msg_type == 'execution_cached':
                            self.logger.debug('使用缓存节点')

                        # 错误消息
                        elif msg_type == 'error':
                            error_info = data.get('data', {})
                            self.logger.error(f"执行错误: {error_info}")
                            raise RuntimeError(f"ComfyUI 执行错误: {error_info}")

                        # 执行开始
                        elif msg_type == 'exec_started':
                            self.logger.debug("工作流开始执行")

                except websocket.WebSocketTimeoutException:
                    continue

        except Exception as e:
            self.logger.error(f"WebSocket 等待出错: {e}")
            raise
        finally:
            ws.close()

        # 执行完成后，获取历史记录和图片
        if execution_finished:
            images = self._fetch_images_with_retry(prompt_id, grace_period=15.0)
            if images:
                return images

        # 如果 WebSocket 模式未能获取图片，使用轮询方式作为备选
        self.logger.warning("WebSocket 完成后未能获取图片，切换到轮询模式")
        return self._wait_for_result_polling(prompt_id, timeout_override=max(self.timeout, 60))

    def _fetch_images_with_retry(
        self,
        prompt_id: str,
        grace_period: float = 15.0,
        initial_interval: float = 0.5,
        max_interval: float = 2.0,
    ) -> List[Dict[str, Any]]:
        """
        WebSocket 显示完成后，从 history 获取图片（带重试）
        """
        deadline = time.time() + grace_period
        wait = initial_interval

        while time.time() < deadline:
            try:
                images = self._get_images_from_history(prompt_id)
                if images:
                    return images
            except RuntimeError as e:
                if "未找到任务记录" not in str(e):
                    raise
                # 历史记录尚未更新，继续等待
            time.sleep(wait)
            wait = min(wait * 1.5, max_interval)

        return []

    def _wait_for_result_polling(
        self,
        prompt_id: str,
        timeout_override: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        使用 HTTP 轮询等待生成结果（备用方法）

        Args:
            prompt_id: 任务 ID
            timeout_override: 超时时间覆盖（秒）

        Returns:
            生成的图片信息列表
        """
        self.logger.info("使用 HTTP 轮询等待生成结果...")

        timeout_seconds = timeout_override or self.timeout
        deadline = time.time() + timeout_seconds
        last_print_time = 0.0

        while time.time() < deadline:
            now = time.time()
            if now - last_print_time >= 2.0:
                remaining = max(0, int(deadline - now))
                print(f"\r[ComfyUI] 等待中... (剩余 {remaining}s)", end='', flush=True)
                last_print_time = now

            resp = self._http.get(f"{self.base_url}/history/{prompt_id}")
            if resp.status_code == 404:
                time.sleep(1.0)
                continue
            resp.raise_for_status()
            data = resp.json()
            # ComfyUI /history/{prompt_id} 返回: {prompt_id: {...history...}}
            history = data.get(prompt_id)
            if not history:
                time.sleep(1.0)
                continue

            # 检查状态
            status = history.get("status", {})
            if status.get("status_str") in {"error", "failed"}:
                error_msg = status.get("error", {}).get("message", "ComfyUI 生成失败")
                raise RuntimeError(f"ComfyUI 生成失败: {error_msg}")

            outputs = history.get("outputs", {})
            images = []
            for output in outputs.values():
                images.extend(output.get("images", []))

            if images:
                print()  # 换行
                return images

            time.sleep(1.0)

        print()  # 换行
        raise TimeoutError(f"等待 ComfyUI 生成图片超时（{timeout_seconds}秒）")

    def _get_images_from_history(self, prompt_id: str) -> List[Dict[str, Any]]:
        """
        从历史记录中获取生成的图片信息

        Args:
            prompt_id: 任务 ID

        Returns:
            图片信息列表
        """
        self.logger.debug("获取历史记录...")

        resp = self._http.get(f"{self.base_url}/history/{prompt_id}")
        resp.raise_for_status()
        data = resp.json()
        # ComfyUI /history/{prompt_id} 返回: {prompt_id: {...history...}}
        history = data.get(prompt_id)

        if not history:
            # 可能还未完成，返回空而不是抛出异常
            raise RuntimeError(f"未找到任务记录: {prompt_id}")

        outputs = history.get("outputs", {})
        images = []
        for node_id, output in outputs.items():
            if 'images' in output:
                for image in output['images']:
                    images.append(image)
                    self.logger.debug(f"找到图片: {image['filename']}")

        if images:
            self.logger.info(f"共 {len(images)} 张图片")
        return images

    def _download_image(self, *, filename: str, subfolder: str, image_type: str) -> bytes:
        """
        从 ComfyUI 服务器下载图片

        Args:
            filename: 文件名
            subfolder: 子文件夹
            image_type: 图片类型 (output/input)

        Returns:
            图片二进制数据
        """
        self.logger.debug(f"下载图片: {filename}")

        params = {"filename": filename, "subfolder": subfolder, "type": image_type}
        resp = self._http.get(f"{self.base_url}/view", params=params)
        resp.raise_for_status()

        self.logger.debug(f"图片下载成功: {len(resp.content)} bytes")
        return resp.content

    def _build_workflow(self, prompt: str, negative_prompt: str, seed: Optional[int]) -> Dict[str, Any]:
        """
        构建 ComfyUI workflow

        如果配置了 workflow_file，则从文件加载并替换参数；
        否则使用内置的 workflow 模板。

        Args:
            prompt: 正面提示词
            negative_prompt: 负面提示词
            seed: 随机种子

        Returns:
            workflow 字典
        """
        actual_seed = seed if seed is not None else self.seed

        # 如果指定了 workflow 文件，从文件加载
        if self.workflow_file:
            return self._load_workflow_from_file(prompt, negative_prompt, actual_seed)

        # 使用内置 workflow
        return self._build_builtin_workflow(prompt, negative_prompt, actual_seed)

    def _load_workflow_from_file(self, prompt: str, negative_prompt: str, seed: int) -> Dict[str, Any]:
        """
        从文件加载 workflow 并替换参数

        Args:
            prompt: 正面提示词
            negative_prompt: 负面提示词
            seed: 随机种子

        Returns:
            workflow 字典
        """
        workflow_path = Path(self.workflow_file)
        if not workflow_path.exists():
            self.logger.warning(f"workflow 文件不存在: {self.workflow_file}，使用内置 workflow")
            return self._build_builtin_workflow(prompt, negative_prompt, seed)

        self.logger.debug(f"加载 workflow 文件: {self.workflow_file}")

        try:
            with open(workflow_path, 'r', encoding='utf-8') as f:
                workflow = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            self.logger.error(f"加载 workflow 文件失败: {e}，使用内置 workflow")
            return self._build_builtin_workflow(prompt, negative_prompt, seed)

        # 查找并替换正面提示词节点
        for node_id, node_data in workflow.items():
            if node_data.get('class_type') == 'CLIPTextEncode':
                text = node_data.get('inputs', {}).get('text', '')
                # 简单的启发式：替换看起来不像负面提示词的节点
                if not any(x in text.lower() for x in ['bad', 'negative', 'ugly', 'blurry', 'low quality']):
                    workflow[node_id]['inputs']['text'] = prompt
                    self.logger.debug(f"替换正面提示词节点: {node_id}")
                    break

        # 查找并替换负面提示词节点
        for node_id, node_data in workflow.items():
            if node_data.get('class_type') == 'CLIPTextEncode':
                text = node_data.get('inputs', {}).get('text', '')
                # 替换看起来像负面提示词的节点
                if any(x in text.lower() for x in ['bad', 'negative', 'ugly', 'blurry', 'low quality']):
                    workflow[node_id]['inputs']['text'] = negative_prompt
                    self.logger.debug(f"替换负面提示词节点: {node_id}")
                    break

        # 查找并替换种子节点
        for node_id, node_data in workflow.items():
            if node_data.get('class_type') in ('KSampler', 'KSamplerAdvanced'):
                if 'seed' in node_data.get('inputs', {}):
                    workflow[node_id]['inputs']['seed'] = seed
                    self.logger.debug(f"替换种子节点: {node_id}, seed={seed}")
                    break

        return workflow

    def _build_builtin_workflow(self, prompt: str, negative_prompt: str, seed: int) -> Dict[str, Any]:
        """
        构建内置的 workflow

        这是一个标准的文生图 workflow，包含:
        - CheckpointLoaderSimple: 加载模型
        - CLIPTextEncode: 正面/负面提示词编码
        - KSampler: 采样器
        - EmptyLatentImage: 空潜在图像
        - VAEDecode: VAE 解码
        - SaveImage: 保存图片

        Args:
            prompt: 正面提示词
            negative_prompt: 负面提示词
            seed: 随机种子

        Returns:
            workflow 字典
        """
        return {
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
                    "seed": seed,
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

    def close(self):
        """关闭 HTTP 客户端"""
        if hasattr(self, '_http'):
            self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
