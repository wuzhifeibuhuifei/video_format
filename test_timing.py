"""
测试AI生成分镜建议时长的功能
支持通过完整文本计算每个分镜的时长
支持使用阿里云 ASR API 从音频中提取时间戳
"""

import toml
from pathlib import Path
from typing import Optional
import httpx
import re
import logging
from datetime import datetime
import opencc
import http.client
import json
import os

# 加载配置文件
CONFIG_PATH = Path(__file__).parent / "config.toml"
config = toml.load(CONFIG_PATH)


def setup_logging(log_dir: str = "logs") -> Path:
    """
    设置日志记录

    Args:
        log_dir: 日志目录路径

    Returns:
        日志文件路径
    """
    log_path = Path(log_dir)
    log_path.mkdir(exist_ok=True)

    # 生成日志文件名（带时间戳）
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = log_path / f"test_timing_{timestamp}.log"

    # 配置日志格式
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler()  # 同时输出到控制台
        ]
    )

    logging.info("=" * 60)
    logging.info("测试脚本启动")
    logging.info(f"日志文件: {log_file}")
    logging.info("=" * 60)

    return log_file


def get_transcript_with_timestamps(
    audio_path: str,
    language: str = "zh",
) -> list[dict]:
    """
    使用阿里云 ASR API 从音频文件中提取带时间戳的转录文本
    自动将繁体字转换为简体中文

    Args:
        audio_path: 音频文件路径
        language: 语言代码 (zh=中文)

    Returns:
        包含每个词片段的字典列表，格式: [{"text": "词", "start": 开始时间, "end": 结束时间}, ...]
    """
    # 获取阿里云 ASR 配置
    asr_config = config.get("aliyun_asr", {})
    appkey = asr_config.get("appkey", "")
    token = asr_config.get("token", "")
    region = asr_config.get("region", "cn-shanghai")

    if not appkey or not token:
        raise ValueError("请先在 config.toml 中配置阿里云 ASR API 的 appkey 和 token")

    # 检查文件是否存在
    if not os.path.isfile(audio_path):
        raise FileNotFoundError(f"音频文件不存在: {audio_path}")

    # 根据区域设置 host
    region_map = {
        "cn-shanghai": "nls-gateway-cn-shanghai.aliyuncs.com",
        "cn-beijing": "nls-gateway-cn-beijing.aliyuncs.com",
        "cn-shenzhen": "nls-gateway-cn-shenzhen.aliyuncs.com",
    }
    host = region_map.get(region, region_map["cn-shanghai"])
    url = f"https://{host}/stream/v1/FlashRecognizer"

    logging.info(f"开始使用阿里云 ASR API 进行语音识别")
    print(f"\n正在使用阿里云 ASR API 进行语音识别...")

    # 初始化简繁转换器
    converter = opencc.OpenCC('t2s')  # 繁体转简体
    logging.info("简繁转换器初始化完成")

    # 确定音频格式
    ext = os.path.splitext(audio_path)[1].upper().lstrip(".")
    supported_formats = ["MP4", "AAC", "MP3", "OPUS", "WAV"]
    if ext not in supported_formats:
        raise ValueError(f"不支持的音频格式: {ext}。支持的格式: {', '.join(supported_formats)}")

    # 读取音频文件
    with open(audio_path, "rb") as f:
        audio_content = f.read()

    logging.info(f"音频文件大小: {len(audio_content)} 字节")
    print(f"音频文件大小: {len(audio_content)} 字节")

    # 构建请求 URL
    request_url = (
        f"{url}"
        f"?appkey={appkey}"
        f"&token={token}"
        f"&format={ext}"
        f"&sample_rate=16000"
        f"&enable_timestamp_alignment=true"
        f"&enable_word_level_result=true"
    )

    # 设置 HTTP 请求头
    headers = {
        "Content-Type": "application/octet-stream",
        "Content-Length": str(len(audio_content)),
    }

    logging.info(f"正在发送识别请求...")
    print(f"正在发送识别请求...")

    # 发送请求
    conn = http.client.HTTPSConnection(host)
    try:
        conn.request("POST", request_url, audio_content, headers)
        response = conn.getresponse()

        logging.info(f"响应状态码: {response.status} {response.reason}")
        print(f"响应状态码: {response.status} {response.reason}")

        body = response.read().decode("utf-8")

        # 解析响应
        try:
            result = json.loads(body)
        except json.JSONDecodeError:
            logging.error(f"响应内容: {body}")
            raise ValueError("服务器返回的不是有效的JSON格式")

    finally:
        conn.close()

    # 检查识别状态
    status = result.get("status")
    message = result.get("message", "")

    if status != 20000000:
        logging.error(f"识别失败: {message} (状态码: {status})")
        raise ValueError(f"识别失败: {message} (状态码: {status})")

    # 解析结果
    flash_result = result.get("flash_result", {})
    sentences = flash_result.get("sentences", [])

    logging.info(f"识别成功，共 {len(sentences)} 句话")
    print(f"识别成功，共 {len(sentences)} 句话")

    # 收集所有词级时间戳
    word_segments = []
    for sentence in sentences:
        words = sentence.get("words", [])
        for word in words:
            original_text = word.get("text", "").strip()
            if original_text:
                # 将繁体字转换为简体
                simplified_text = converter.convert(original_text)
                # 时间戳可能是字符串或数字，需要转换为整数（毫秒）
                begin_time = int(word.get("begin_time", 0))
                end_time = int(word.get("end_time", 0))
                # 将毫秒转换为秒
                word_segments.append({
                    "text": simplified_text,
                    "start": begin_time / 1000,
                    "end": end_time / 1000,
                })

    logging.info(f"转录完成: 共 {len(word_segments)} 个词（已转换为简体中文）")
    print(f"共提取 {len(word_segments)} 个词片段（已转换为简体中文）")

    return word_segments


def find_script_line_timestamps(
    script_lines: list[str],
    word_segments: list[dict],
    fuzzy_match: bool = True,
) -> list[dict]:
    """
    根据分镜脚本在词级时间戳中查找每个分镜的时间范围

    Args:
        script_lines: 分镜脚本列表
        word_segments: 词级时间戳列表
        fuzzy_match: 是否使用模糊匹配（去除标点符号等）

    Returns:
        每个分镜的时间信息列表，格式: [{"text": "脚本", "start": 开始时间, "end": 结束时间, "duration": 时长}, ...]
    """
    logging.info(f"开始匹配分镜时间戳，共 {len(script_lines)} 个分镜")
    results = []

    # 构建完整文本的时间映射
    full_text_with_times = []
    for seg in word_segments:
        full_text_with_times.append({
            "text": seg["text"],
            "start": seg["start"],
            "end": seg["end"],
        })

    logging.info(f"完整文本时间映射构建完成，共 {len(full_text_with_times)} 个词")

    # 当前匹配位置
    current_position = 0

    for i, script_line in enumerate(script_lines, 1):
        # 标准化脚本文本用于匹配
        search_text = script_line.strip()
        if fuzzy_match:
            # 移除标点符号进行匹配
            import string
            search_text = search_text.translate(str.maketrans("", "", string.punctuation + "，。！？、；：""''（）【】《》"))

        logging.info(f"查找第 {i}/{len(script_lines)} 个分镜: {script_line[:30]}...")
        print(f"\n查找第 {i} 个分镜: {script_line}")

        # 在完整文本中查找匹配
        matched_start_idx = None
        matched_end_idx = None
        accumulated_text = ""

        for idx in range(current_position, len(full_text_with_times)):
            word_info = full_text_with_times[idx]
            word_text = word_info["text"]
            if fuzzy_match:
                import string
                word_text = word_text.translate(str.maketrans("", "", string.punctuation + "，。！？、；：""''（）【】《》"))

            accumulated_text += word_text

            if search_text in accumulated_text and matched_start_idx is None:
                # 找到匹配开始
                matched_start_idx = idx
                # 回溯找到准确的开始位置
                temp_text = ""
                for j in range(idx, current_position - 1, -1):
                    temp_text = full_text_with_times[j]["text"] + temp_text
                    if fuzzy_match:
                        temp_text_raw = temp_text
                        import string
                        temp_text = temp_text_raw.translate(str.maketrans("", "", string.punctuation + "，。！？、；：""''（）【】《》"))
                    if search_text.startswith(temp_text) or temp_text_raw in search_text:
                        matched_start_idx = j
                    else:
                        break

                # 找到结束位置（估计）
                matched_end_idx = min(idx + len(search_text) // 2, len(full_text_with_times) - 1)
                break

        # 如果找到了匹配
        if matched_start_idx is not None:
            # 尝试更精确地找到结束位置
            remaining_search = search_text
            for idx in range(matched_start_idx, len(full_text_with_times)):
                word_text = full_text_with_times[idx]["text"]
                remaining_search = remaining_search[len(word_text):] if remaining_search.startswith(word_text) else remaining_search
                if not remaining_search or idx - matched_start_idx > len(search_text):
                    matched_end_idx = idx
                    break

            start_time = full_text_with_times[matched_start_idx]["start"]
            end_time = full_text_with_times[matched_end_idx]["end"]
            duration = end_time - start_time

            results.append({
                "text": script_line,
                "start": start_time,
                "end": end_time,
                "duration": duration,
            })

            logging.info(f"  ✓ 匹配成功: [{start_time:.2f}s - {end_time:.2f}s] 时长={duration:.2f}s")
            print(f"  ✓ 找到匹配: {start_time:.2f}s - {end_time:.2f}s (时长: {duration:.2f}s)")

            # 更新当前位置
            current_position = matched_end_idx + 1
        else:
            # 未找到匹配，使用估计值
            logging.warning(f"  ✗ 未找到精确匹配，使用估计值")
            print(f"  ✗ 未找到精确匹配，使用估计值")
            # 基于脚本长度估计时长（每秒约3-4个字）
            estimated_duration = max(2.0, len(search_text) / 3.5)
            if results:
                start_time = results[-1]["end"]
            else:
                start_time = 0.0
            end_time = start_time + estimated_duration

            results.append({
                "text": script_line,
                "start": start_time,
                "end": end_time,
                "duration": estimated_duration,
            })

            logging.info(f"  → 估计时长: {estimated_duration:.2f}s")
            print(f"  → 估计时长: {estimated_duration:.2f}s")
            current_position = current_position  # 保持不变

    logging.info(f"分镜时间戳匹配完成，成功匹配 {len(results)}/{len(script_lines)} 个分镜")
    return results


def calculate_durations_from_timestamps(
    timestamp_results: list[dict],
    min_duration: float = 2.0,
    max_duration: float = 15.0,
) -> list[float]:
    """
    从时间戳结果中提取时长列表

    Args:
        timestamp_results: 时间戳结果列表
        min_duration: 最小时长限制
        max_duration: 最大时长限制

    Returns:
        时长列表（秒）
    """
    durations = []
    for result in timestamp_results:
        duration = result["duration"]
        # 应用时长限制
        duration = max(min_duration, min(max_duration, duration))
        durations.append(duration)

    return durations


def find_timestamps_with_ai(
    script_lines: list[str],
    word_segments: list[dict],
) -> list[dict]:
    """
    使用 AI 根据语义匹配分镜脚本和时间戳文本，找到每个分镜的时间范围

    Args:
        script_lines: 分镜脚本列表
        word_segments: 词级时间戳列表

    Returns:
        每个分镜的时间信息列表，格式: [{"text": "脚本", "start": 开始时间, "end": 结束时间, "duration": 时长}, ...]
    """
    logging.info("开始使用 AI 进行语义匹配分镜时间戳")

    # 构建 AI prompt
    # 构建时间戳流文本
    timestamp_flow = ""
    for seg in word_segments:
        timestamp_flow += f"[{seg['start']:.2f}s-{seg['end']:.2f}s] {seg['text']}\n"

    # 构建分镜脚本文本
    script_lines_text = ""
    for i, line in enumerate(script_lines, 1):
        script_lines_text += f"{i}. {line}\n"

    prompt = f"""# Role
你是一个专业的音视频对齐算法引擎，擅长将"字粒度（Word-level）"的时间戳数据与"分镜脚本（Sentence-level）"进行精准匹配。

# Input Data
1. **时间戳流**：格式为 `[开始时间s-结束时间s] 单词` 的序列。
2. **分镜脚本**：按顺序排列的句子或段落。

# Constraints & Logic
请严格遵循以下步骤进行处理：

1. **预处理与模糊匹配**：
   - 忽略脚本和时间戳中的所有标点符号、空格和换行。
   - 针对同义词或错别字（如"断 连"与"断联"），请基于语音相似度或上下文模糊匹配。
   - **注意**：脚本中的内容在时间戳流中是按顺序出现的。

2. **边界定位**：
   - **Start Time (开始时间)**：找到该分镜脚本中**第一个文字**在时间戳流中对应的起始时间。
   - **End Time (结束时间)**：找到该分镜脚本中**最后一个文字**在时间戳流中对应的结束时间。
   - **Duration (时长)**：End Time - Start Time。

3. **特殊情况处理**：
   - 如果分镜脚本存在包含关系（例如：分镜7的文本完全包含在分镜6的结尾），请如实返回两者对应的物理时间（允许时间重叠），但请确保匹配的是最长连续片段。
   - 如果分镜之间存在静音间隙，**不**要将静音计入上一个分镜的时长，严格按照文字结束的时间截断。

4. **格式解析**：
   - 输入的时间格式为 `0.06s`，请解析为浮点数 `0.06`。

# Output Format
- 仅输出一个标准的 JSON 数组，不包含 markdown 代码块标记（```json），不包含任何解释性文字。
- 格式如下：
[
  {{
    "id": 1,
    "text": "分镜文本内容",
    "start": 0.00,
    "end": 3.50,
    "duration": 3.50
  }}
]

# Data Content

## 1. 音频时间戳文本
{timestamp_flow}

## 2. 分镜脚本
{script_lines_text}"""

    api_url = config.get("volcengine", {}).get("api_url", "")
    api_key = config.get("volcengine", {}).get("api_key", "")

    if not api_url or not api_key or api_key == "your-api-key-here":
        raise ValueError("请先在 config.toml 中配置火山引擎 API 信息")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    print(f"prompt: {prompt}")
    payload = {
        "model": config.get("volcengine", {}).get("model", "default"),
        "messages": [
            {"role": "user", "content": [
                {
                    "type": "text",
                    "text": prompt
                }
            ]}
        ],
        "temperature": 0.3,
    }

    logging.info(f"发送 AI 匹配请求，分镜数量: {len(script_lines)}")
    print("\n正在使用 AI 进行语义匹配...")

    with httpx.Client(timeout=120.0) as client:
        response = client.post(api_url, json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()

    logging.info(f"AI 响应状态: {response.status_code}")

    # 解析 API 响应
    content_text = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    logging.info(f"AI 返回内容: {content_text[:500]}...")

    # 尝试提取 JSON 数组
    import json

    # 清理可能的 markdown 代码块标记
    content_text = content_text.strip()
    if content_text.startswith("```json"):
        content_text = content_text[7:]
    if content_text.startswith("```"):
        content_text = content_text[3:]
    if content_text.endswith("```"):
        content_text = content_text[:-3]
    content_text = content_text.strip()

    try:
        results = json.loads(content_text)

        # 验证结果格式
        if not isinstance(results, list):
            raise ValueError("AI 返回的不是数组格式")

        if len(results) != len(script_lines):
            logging.warning(f"AI 返回的分镜数量({len(results)})与脚本数量({len(script_lines)})不一致")

        # 验证每个结果的字段
        for i, item in enumerate(results):
            # 新格式包含 "id", "text", "start", "end", "duration"
            required_fields = ["id", "text", "start", "end", "duration"]
            if not all(key in item for key in required_fields):
                raise ValueError(f"第 {i+1} 个结果缺少必要字段，需要包含: {required_fields}")

            # 转换数据类型
            item["start"] = float(item["start"])
            item["end"] = float(item["end"])
            item["duration"] = float(item["duration"])

        logging.info(f"AI 匹配完成，成功匹配 {len(results)}/{len(script_lines)} 个分镜")
        return results

    except json.JSONDecodeError as e:
        logging.error(f"解析 AI 返回的 JSON 失败: {e}")
        logging.error(f"原始内容: {content_text}")
        raise ValueError(f"无法解析 AI 返回的 JSON: {e}")


def calculate_durations_from_full_text(
    full_text: str,
    script_lines: list[str],
) -> list[float]:
    """
    通过完整文本计算每个分镜的时长

    Args:
        full_text: 完整的旁白文本
        script_lines: 分镜脚本文本列表

    Returns:
        每个分镜的时长列表（秒）
    """
    logging.info("开始使用 AI API 计算分镜时长")
    api_url = config.get("volcengine", {}).get("api_url", "")
    api_key = config.get("volcengine", {}).get("api_key", "")

    if not api_url or not api_key or api_key == "your-api-key-here":
        raise ValueError("请先在 config.toml 中配置火山引擎 API 信息")

    # 构建请求内容
    text_content = """我有一段完整的旁白文本和他在音频中的总时长，以及将它切分后的多个分镜文本。

请帮我分析每个分镜文本在完整文本中对应的内容，并计算每个分镜应该展示的时长（秒）。

计算要求：
1. 每个分镜文本在完整文本中的语义位置和内容多少来计算时长
2. 考虑情感表达、停顿等因素
3. 只返回每个分镜的时长，格式为数字列表，如：[3.5, 4.2, 2.8, ...]
4. 计算后的分镜总时长需要约等于音频总时长

完整的音频总时长：74s
完整旁白文本：
"""
    text_content += full_text.strip()
    text_content += "\n\n分镜文本：\n"
    for i, line in enumerate(script_lines, 1):
        text_content += f"{i}. {line}\n"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": config.get("volcengine", {}).get("model", "default"),
        "messages": [
            {"role": "user", "content": text_content}
        ],
        "temperature": 0.3,
    }

    logging.info(f"API URL: {api_url}")
    logging.info(f"Model: {payload['model']}")
    logging.info(f"分镜数量: {len(script_lines)}")
    logging.info(f"完整文本长度: {len(full_text.strip())} 字符")

    print(f"\nAPI URL: {api_url}")
    print(f"Model: {payload['model']}")
    print(f"\n发送的Prompt:\n{text_content}")
    print("\n正在调用API...")

    with httpx.Client(timeout=60.0) as client:
        response = client.post(api_url, json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()

    logging.info(f"API响应状态: {response.status_code}")
    print("\nAPI响应状态:", response.status_code)
    print("API响应内容:")
    import json
    print(json.dumps(result, ensure_ascii=False, indent=2))

    # 解析API响应
    content_text = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    logging.info(f"API返回内容: {content_text[:200]}...")
    print(f"\n解析的内容:\n{content_text}")

    # 尝试提取数字列表
    match = re.search(r"\[([\d.,\s]+)\]", content_text)
    if match:
        durations = [float(x.strip()) for x in match.group(1).split(",")]
        logging.info(f"解析出的时长列表: {durations}")
        print(f"\n解析出的时长列表: {durations}")

        # 应用时长限制
        timing_config = config.get("timing", {})
        min_duration = timing_config.get("min_duration", 2.0)
        max_duration = timing_config.get("max_duration", 15.0)

        durations = [
            max(min_duration, min(max_duration, d)) for d in durations
        ]
        logging.info(f"应用限制后的时长列表 (min={min_duration}s, max={max_duration}s): {durations}")
        print(f"应用限制后的时长列表: {durations}")

        # 确保时长数量与分镜数量一致
        if len(durations) != len(script_lines):
            logging.error(f"API返回的时长数量({len(durations)})与分镜数量({len(script_lines)})不一致")
            print(f"警告: API返回的时长数量({len(durations)})与分镜数量({len(script_lines)})不一致")
            return []

        logging.info(f"AI API 计算完成，总时长: {sum(durations):.2f}秒")
        return durations
    else:
        logging.error("无法从API响应中解析出时长列表")
        print("\n无法从API响应中解析出时长列表")
        return []


def main():
    """主函数"""
    import sys

    # 初始化日志
    log_file = setup_logging()

    # 解析命令行参数
    use_ai_match = "--ai-match" in sys.argv or "-a" in sys.argv
    audio_path = "assets/audio/narration.mp3"

    # 检查音频文件
    if not Path(audio_path).exists():
        logging.error(f"音频文件不存在: {audio_path}")
        print(f"错误: 音频文件不存在: {audio_path}")
        print("请将音频文件放置在 assets/audio/narration.mp3 或使用 --audio 参数指定路径")
        return

    logging.info(f"运行模式: {'阿里云 ASR + AI语义匹配' if use_ai_match else '阿里云 ASR 时间戳'}")

    # 完整的旁白文本
    full_text = """
这是一本借童话外衣包裹的心理咨询实录。蛤蟆从抑郁、依赖到最终找回自我的十次面谈，实则是每个人与自己和解的隐喻。

书中核心的"自我状态理论"——儿童、父母、成人三种状态——揭示了我们痛苦的根源：我们常常在儿童自我中依赖他人认可，在父母自我中苛责自己，却鲜少进入成人自我——那个能理性思考、为自己负责的状态。

更深刻的是，苍鹭医生从未给蛤蟆答案，而是不断问："你觉得呢？"这种近乎冷漠的专业姿态，恰恰道出了心理咨询的真谛：疗愈不是他人给的，而是自己在追问中长出来的。蛤蟆的转变，本质上是把"为什么是我"的受害者叙事，重构为"我能做什么"的能动性选择。

这本书最触动人心的，或许不是某个理论，而是它温柔地告诉我们：抑郁不是软弱，而是在提醒你——你与自己断联太久了。
"""

    # 分镜脚本
    script_lines = [
        "这是一本借童话外衣包裹的心理咨询实录。",
        "蛤蟆从抑郁、依赖到最终找回自我的十次面谈，实则是每个人与自己和解的隐喻。",
        "书中核心的\"自我状态理论\"——儿童、父母、成人三种状态——揭示了我们痛苦的根源",
        "我们常常在儿童自我中依赖他人认可，在父母自我中苛责自己",
        "却鲜少进入成人自我——那个能理性思考、为自己负责的状态。",
        "更深刻的是，苍鹭医生从未给蛤蟆答案，而是不断问：\"你觉得呢？\"这种近乎冷漠的专业姿态，恰恰道出了心理咨询的真谛：疗愈不是他人给的，而是自己在追问中长出来的。",
        "疗愈不是他人给的，而是自己在追问中长出来的。",
        "蛤蟆的转变，本质上是把\"为什么是我\"的受害者叙事，重构为\"我能做什么\"的能动性选择。",
        "这本书最触动人心的，或许不是某个理论，而是它温柔地告诉我们",
        "抑郁不是软弱，而是在提醒你——你与自己断联太久了。",
    ]

    logging.info(f"分镜数量: {len(script_lines)}")
    logging.info(f"完整文本长度: {len(full_text.strip())} 字符")

    print("=" * 60)
    if use_ai_match:
        print("测试使用阿里云 ASR + AI 语义匹配计算时长")
    else:
        print("测试使用阿里云 ASR 提取音频时间戳计算时长")
    print("=" * 60)
    print(f"\n分镜数量: {len(script_lines)}")
    print(f"完整文本长度: {len(full_text.strip())} 字符")

    try:
        durations = []

        # 检查是否存在缓存的字幕文件
        narration_detail_path = Path("assets/subtitles/narration_detail.json")

        if narration_detail_path.exists():
            # 使用缓存的字幕文件
            logging.info(f"使用缓存的字幕文件: {narration_detail_path}")
            print(f"\n使用缓存的字幕文件: {narration_detail_path}")
            print("\n步骤 1: 从缓存文件读取词级时间戳...")

            with open(narration_detail_path, 'r', encoding='utf-8') as f:
                narration_data = json.load(f)

            # 初始化简繁转换器
            converter = opencc.OpenCC('t2s')  # 繁体转简体

            # 从缓存数据中提取词级时间戳
            word_segments = []
            sentences = narration_data.get("flash_result", {}).get("sentences", [])
            for sentence in sentences:
                words = sentence.get("words", [])
                for word in words:
                    original_text = word.get("text", "").strip()
                    if original_text:
                        # 将繁体字转换为简体
                        simplified_text = converter.convert(original_text)
                        # 时间戳可能是字符串或数字，需要转换为整数（毫秒）
                        begin_time = int(word.get("begin_time", 0))
                        end_time = int(word.get("end_time", 0))
                        # 将毫秒转换为秒
                        word_segments.append({
                            "text": simplified_text,
                            "start": begin_time / 1000,
                            "end": end_time / 1000,
                        })

            logging.info(f"从缓存文件读取完成: 共 {len(word_segments)} 个词")
            print(f"从缓存文件读取完成: 共 {len(word_segments)} 个词片段")
        else:
            # 使用阿里云 ASR API 从音频中提取时间戳
            logging.info(f"使用音频文件: {audio_path}")
            print(f"\n使用音频文件: {audio_path}")
            print("\n步骤 1: 使用阿里云 ASR API 提取词级时间戳...")
            word_segments = get_transcript_with_timestamps(audio_path, language="zh")

        if use_ai_match:
            # 使用 AI 进行语义匹配
            print("\n步骤 2: 使用 AI 进行语义匹配时间戳...")
            timestamp_results = find_timestamps_with_ai(script_lines, word_segments)
        else:
            # 使用规则匹配
            print("\n步骤 2: 根据分镜脚本查找时间范围...")
            timestamp_results = find_script_line_timestamps(script_lines, word_segments, fuzzy_match=True)

        print("\n步骤 3: 提取时长列表...")
        timing_config = config.get("timing", {})
        min_duration = timing_config.get("min_duration", 2.0)
        max_duration = timing_config.get("max_duration", 15.0)
        logging.info(f"时长限制: min={min_duration}s, max={max_duration}s")
        durations = calculate_durations_from_timestamps(timestamp_results, min_duration, max_duration)

        print("\n" + "=" * 60)
        print("阿里云 ASR 时间戳匹配结果")
        print("=" * 60)
        print("\n各分镜时间信息:")
        for i, result in enumerate(timestamp_results, 1):
            print(f"{i:2d}. [{result['start']:6.2f}s - {result['end']:6.2f}s] ({result['duration']:5.2f}秒) {result['text']}")
            logging.info(f"分镜 {i}: [{result['start']:.2f}s - {result['end']:.2f}s] ({result['duration']:.2f}秒)")

        if durations:
            total = sum(durations)
            logging.info(f"计算完成，总时长: {total:.2f}秒")

            print("\n" + "=" * 60)
            print("最终建议时长")
            print("=" * 60)
            print("\n各分镜建议时长:")
            for i, (text, duration) in enumerate(zip(script_lines, durations), 1):
                print(f"{i:2d}. [{duration:5.2f}秒] {text}")
                logging.info(f"分镜 {i}: {duration:.2f}秒 - {text[:30]}...")

            print(f"\n总时长: {total:.2f}秒 ({total/60:.2f}分钟)")

            # 与文本字符数的对比
            print("\n时长对比（文本字符数 vs 建议时长）:")
            for i, (text, duration) in enumerate(zip(script_lines, durations), 1):
                char_count = len(text)
                ratio = duration / char_count if char_count > 0 else 0
                print(f"{i:2d}. {char_count:3d}字符 → {duration:5.2f}秒 (比值: {ratio:.3f})")
        else:
            logging.error("未能获取有效的时长数据")
            print("\n测试失败：未能获取有效的时长数据")

        logging.info("=" * 60)
        logging.info("测试脚本执行完成")
        logging.info("=" * 60)

    except Exception as e:
        logging.error(f"测试失败: {e}")
        import traceback
        logging.error(traceback.format_exc())
        print(f"\n测试失败: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    main()
