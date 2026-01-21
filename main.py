
# Video generation workflow combining ASR alignment, storyboard prompts, and MiniMax TTS.

import argparse
import json
import logging
import os
import random
import re
import http.client
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import opencc
import toml
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from moviepy import (
    AudioFileClip,
    CompositeAudioClip,
    CompositeVideoClip,
    ImageClip,
    TextClip,
    afx,
    vfx,
)
from pydantic import BaseModel, Field

from database import ProjectDatabase, ShotRecord
from generation import StoryboardGenerator
from minimax_speech import MiniMaxSpeechClient
from comfyui_client import ComfyUIClient

# ============== 日志配置 ==============
def setup_logging() -> logging.Logger:
    """配置并返回日志记录器"""
    log_dir = Path(__file__).parent / 'logs'
    log_dir.mkdir(parents=True, exist_ok=True)

    # 生成日志文件名（带时间戳）
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    log_file = log_dir / f'video_gen_{timestamp}.log'

    # 配置日志格式
    log_format = '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s'
    date_format = '%Y-%m-%d %H:%M:%S'

    # 创建 logger
    logger = logging.getLogger('VideoGen')
    logger.setLevel(logging.DEBUG)

    # 避免重复添加 handler
    if logger.handlers:
        return logger

    # 文件 handler（记录所有级别）
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_formatter = logging.Formatter(log_format, datefmt=date_format)
    file_handler.setFormatter(file_formatter)

    # 控制台 handler（只记录 INFO 及以上）
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter(
        fmt='[%(levelname)s] %(message)s',
        datefmt='%H:%M:%S'
    )
    console_handler.setFormatter(console_formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    logger.info(f'日志文件: {log_file}')
    return logger


# 初始化日志
logger = setup_logging()

CONFIG_PATH = Path(__file__).parent / 'config.toml'
config = toml.load(CONFIG_PATH)

TARGET_W, TARGET_H = 1080, 1920
workflow_defaults = config.get('workflow', {})
video_defaults = config.get('video', {})
DEFAULT_SCENE_COUNT = workflow_defaults.get('default_scene_count', 8)
DEFAULT_IMAGE_STYLE = workflow_defaults.get('default_image_style', 'cinematic, volumetric lighting')
DEFAULT_NEGATIVE_PROMPT = workflow_defaults.get('default_negative_prompt', 'low quality, blurry')
DEFAULT_STORY_TONE = workflow_defaults.get('default_story_tone', 'Warm, rational narrations')
DEFAULT_ASPECT_RATIO = video_defaults.get('aspect_ratio', '16:9')

def get_resolution_from_config(aspect_ratio: str = '16:9') -> tuple[int, int]:
    aspect_map = {
        '16:9': (1920, 1080),
        '9:16': (1080, 1920),
        '4:3': (1440, 1080),
        '1:1': (1080, 1080),
    }
    return aspect_map.get(aspect_ratio, (1920, 1080))


def create_bgm_audio(
    bgm_path: str,
    duration: float,
    volume: float = 0.2,
    loop: bool = True,
    fadein: float = 2.0,
    fadeout: float = 3.0,
) -> Optional[AudioFileClip]:
    if not Path(bgm_path).exists():
        print(f'[bgm] missing file: {bgm_path}')
        return None

    bgm = AudioFileClip(bgm_path)
    if loop and bgm.duration < duration:
        loops_needed = int(duration / bgm.duration) + 1
        bgm = bgm.with_effects([vfx.Loop(n=loops_needed)])

    if bgm.duration > duration:
        bgm = bgm.subclipped(0, duration)

    try:
        bgm = bgm.with_effects([afx.MultiplyVolume(volume)])
    except AttributeError:
        try:
            bgm = bgm.volumex(volume)
        except AttributeError:
            bgm = bgm.multiply_volume(volume)

    if fadein > 0:
        try:
            bgm = bgm.with_effects([afx.AudioFadeIn(fadein)])
        except AttributeError:
            bgm = bgm.audio_fadein(fadein)

    if fadeout > 0:
        try:
            bgm = bgm.with_effects([afx.AudioFadeOut(fadeout)])
        except AttributeError:
            bgm = bgm.audio_fadeout(fadeout)

    return bgm


def apply_ken_burns_effect(
    clip: ImageClip,
    movement_type: str = 'random',
    zoom_ratio: float = 1.08,
    pan_x_range: int = 30,
    pan_y_range: int = 30,
):
    duration = clip.duration
    w, h = clip.size

    if movement_type == 'random':
        movement_type = random.choice([
            'zoom_in',
            'zoom_out',
            'pan_left',
            'pan_right',
            'pan_up',
            'pan_down',
        ])

    if movement_type == 'zoom_in':
        resize_func = lambda t: 1.0 + (zoom_ratio - 1.0) * (t / duration)
        pan_x = pan_y = 0
    elif movement_type == 'zoom_out':
        resize_func = lambda t: zoom_ratio - (zoom_ratio - 1.0) * (t / duration)
        pan_x = pan_y = 0
    elif movement_type == 'pan_left':
        resize_func = lambda t: zoom_ratio
        pan_x, pan_y = -pan_x_range, 0
    elif movement_type == 'pan_right':
        resize_func = lambda t: zoom_ratio
        pan_x, pan_y = pan_x_range, 0
    elif movement_type == 'pan_up':
        resize_func = lambda t: zoom_ratio
        pan_x, pan_y = 0, -pan_y_range
    elif movement_type == 'pan_down':
        resize_func = lambda t: zoom_ratio
        pan_x, pan_y = 0, pan_y_range
    else:
        return clip

    resized = clip.with_effects([vfx.Resize(resize_func)])

    if pan_x == 0 and pan_y == 0:
        return resized

    def make_frame(t):
        frame = resized.get_frame(t)
        x_offset = int(((resized.w - w) / 2) + pan_x * (t / duration))
        y_offset = int(((resized.h - h) / 2) + pan_y * (t / duration))
        x_offset = max(0, min(x_offset, resized.w - w))
        y_offset = max(0, min(y_offset, resized.h - h))
        return frame[y_offset:y_offset + h, x_offset:x_offset + w]

    from moviepy import VideoClip

    final_clip = VideoClip(make_frame, duration=duration)
    final_clip.fps = getattr(clip, 'fps', 24)
    return final_clip


def get_transcript_with_timestamps(
    audio_path: str,
    language: str = 'zh',
    force_refresh: bool = False,
) -> List[dict]:
    """从音频文件中获取带时间戳的转录文本"""
    logger.info(f'开始获取音频时间戳: {audio_path}')
    logger.debug(f'参数: language={language}, force_refresh={force_refresh}')

    converter = opencc.OpenCC('t2s')
    audio_filename = Path(audio_path).stem
    subtitles_dir = Path(__file__).parent / 'assets' / 'subtitles'
    subtitles_dir.mkdir(parents=True, exist_ok=True)
    json_file_path = subtitles_dir / f'{audio_filename}_detail.json'
    logger.debug(f'缓存文件路径: {json_file_path}')

    if json_file_path.exists() and not force_refresh:
        logger.debug(f'找到缓存文件，尝试加载...')
        try:
            with open(json_file_path, 'r', encoding='utf-8') as fh:
                cached = json.load(fh)
            if cached.get('status') == 20000000:
                flash_result = cached.get('flash_result', {})
                sentences = flash_result.get('sentences', [])
                segments = []
                for sentence in sentences:
                    for word in sentence.get('words', []):
                        text_value = converter.convert(word.get('text', ''))
                        segments.append(
                            {
                                'text': text_value,
                                'start': int(word.get('begin_time', 0)) / 1000,
                                'end': int(word.get('end_time', 0)) / 1000,
                            }
                        )
                logger.info(f'从缓存加载成功，共 {len(segments)} 个词')
                return segments
        except Exception as e:
            logger.warning(f'缓存加载失败: {e}')

    # 缓存未命中，调用阿里云 ASR API
    logger.info(f'缓存未命中，调用阿里云 ASR API...')
    asr_config = config.get('aliyun_asr', {})
    appkey = asr_config.get('appkey')
    token = asr_config.get('token')
    region = asr_config.get('region', 'cn-shanghai')
    if not appkey or not token:
        raise ValueError('Aliyun ASR credentials are missing')

    region_map = {
        'cn-shanghai': 'nls-gateway-cn-shanghai.aliyuncs.com',
        'cn-beijing': 'nls-gateway-cn-beijing.aliyuncs.com',
        'cn-shenzhen': 'nls-gateway-cn-shenzhen.aliyuncs.com',
    }
    host = region_map.get(region, region_map['cn-shanghai'])
    logger.debug(f'ASR region: {region}, host: {host}')

    ext = os.path.splitext(audio_path)[1].upper().lstrip('.')
    supported = {'MP4', 'AAC', 'MP3', 'OPUS', 'WAV'}
    if ext not in supported:
        raise ValueError(f'Unsupported audio format: {ext}')

    # 使用 test_timing.py 中验证过的方式：URL 查询参数 + application/octet-stream
    url = f"https://{host}/stream/v1/FlashRecognizer"
    request_url = (
        f"{url}"
        f"?appkey={appkey}"
        f"&token={token}"
        f"&format={ext}"
        f"&sample_rate=16000"
        f"&enable_timestamp_alignment=true"
        f"&enable_word_level_result=true"
    )

    with open(audio_path, "rb") as f:
        audio_content = f.read()
    logger.debug(f'音频文件大小: {len(audio_content)} bytes')

    headers = {
        "Content-Type": "application/octet-stream",
        "Content-Length": str(len(audio_content)),
    }

    logger.info(f'正在发送请求到阿里云 ASR...')
    conn = http.client.HTTPSConnection(host)
    conn.request('POST', request_url, audio_content, headers)
    response = conn.getresponse()
    data = response.read().decode('utf-8')
    conn.close()
    result = json.loads(data)

    logger.debug(f'ASR 响应状态: {result.get("status")}')
    if result.get('status') != 20000000:
        logger.error(f'ASR 失败: {result.get("message")}')
        raise ValueError(f"ASR failed: {result.get('message')}")

    # 保存缓存
    with open(json_file_path, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
    logger.info(f'ASR 结果已缓存到: {json_file_path}')

    flash_result = result.get('flash_result', {})
    sentences = flash_result.get('sentences', [])
    segments = []
    for sentence in sentences:
        for word in sentence.get('words', []):
            text_value = converter.convert(word.get('text', ''))
            segments.append(
                {
                    'text': text_value,
                    'start': int(word.get('begin_time', 0)) / 1000,
                    'end': int(word.get('end_time', 0)) / 1000,
                }
            )
    logger.info(f'ASR 完成，共识别 {len(segments)} 个词')
    return segments


def find_timestamps_with_ai(script_lines: List[str], word_segments: List[dict]) -> List[dict]:
    """使用 AI 语义匹配将脚本与时间戳对齐"""
    logger.info(f'开始 AI 语义匹配，脚本数量: {len(script_lines)}, 词段数量: {len(word_segments)}')

    # 完整文本（所有词段拼接）
    complete_text = ''.join(seg['text'] for seg in word_segments)

    # 带时间戳的词段流
    timestamp_flow = ''.join(
        f"[{seg['start']:.2f}s-{seg['end']:.2f}s] {seg['text']}\\n" for seg in word_segments
    )
    # 分镜脚本
    script_text = '\\n'.join(f"{idx + 1}. {line}" for idx, line in enumerate(script_lines))

    prompt = (
        "你是一个音频对齐引擎。任务：将分镜脚本与音频时间戳进行语义匹配。\\n\\n"
        f"【完整音频转录文本】\\n{complete_text}\\n\\n"
        f"【词级时间戳流】\\n{timestamp_flow}\\n\\n"
        f"【需要匹配的分镜脚本】\\n{script_text}\\n\\n"
        "要求：分析完整转录文本和分镜脚本的语义对应关系，结合词级时间戳，为每个分镜脚本确定准确的开始和结束时间。\\n\\n"
        "必须返回纯 JSON 数组格式，不要包含任何其他文字说明：\\n"
        "[\\n"
        "  {\\\"id\\\": 1, \\\"text\\\": \\\"第一句脚本\\\", \\\"start\\\": 0.0, \\\"end\\\": 5.2, \\\"duration\\\": 5.2},\\n"
        "  {\\\"id\\\": 2, \\\"text\\\": \\\"第二句脚本\\\", \\\"start\\\": 5.2, \\\"end\\\": 10.5, \\\"duration\\\": 5.3}\\n"
        "]"
    )
    logger.debug(f'完整文本长度: {len(complete_text)} 字符')

    volc_cfg = config.get('volcengine', {})
    api_url = volc_cfg.get('api_url')
    api_key = volc_cfg.get('api_key')
    model = volc_cfg.get('model')
    if not api_url or not api_key or not model:
        raise ValueError('Volcengine config is missing')

    logger.debug(f'使用模型: {model}')
    headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
    payload = {
        'model': model,
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt}]}],
        'temperature': 0.3,
    }

    logger.info(f'正在调用 LLM API 进行语义匹配...')
    with httpx.Client(timeout=120.0) as client:
        resp = client.post(api_url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
    logger.debug(f'LLM 原始响应类型: {type(content)}')

    # 处理不同类型的内容响应
    if isinstance(content, list):
        content = '\\n'.join(part.get('text', '') for part in content if isinstance(part, dict))

    content = content.strip()
    logger.debug(f'LLM 响应内容（前500字符）: {content[:500]}...')

    # 尝试提取 JSON
    json_start = content.find('[')
    json_end = content.rfind(']') + 1

    if json_start >= 0 and json_end > json_start:
        json_content = content[json_start:json_end]
        logger.debug(f'提取的 JSON: {json_content[:200]}...')
        try:
            result = json.loads(json_content)
            logger.info(f'AI 匹配完成，返回 {len(result)} 条结果')
            return result
        except json.JSONDecodeError as e:
            logger.error(f'JSON 解析失败: {e}')
            logger.error(f'尝试解析的内容: {json_content}')
            raise
    else:
        logger.error(f'响应中未找到有效的 JSON 数组')
        logger.error(f'完整响应内容: {content}')
        raise ValueError(f'LLM 返回的内容不是有效的 JSON 格式')


def calculate_scene_durations(audio_path: str, script_lines: List[str]) -> List[float]:
    """计算每个场景的时长"""
    logger.info(f'开始计算场景时长，脚本数量: {len(script_lines)}')

    timing_config = config.get('timing', {})
    min_duration = timing_config.get('min_duration', 2.0)
    max_duration = timing_config.get('max_duration', 15.0)
    base_duration = timing_config.get('base_duration', 3.0)
    chars_per_second = timing_config.get('chars_per_second', 0.25)

    logger.debug(f'时长配置: min={min_duration}s, max={max_duration}s, base={base_duration}s')

    try:
        word_segments = get_transcript_with_timestamps(audio_path)
        timestamp_results = find_timestamps_with_ai(script_lines, word_segments)

        durations = []
        for result in timestamp_results:
            duration = max(min_duration, min(max_duration, result.get('duration', 0)))
            durations.append(duration)
        logger.info(f'使用 AI 匹配计算时长: {durations}')
        return durations
    except Exception as e:
        logger.warning(f'ASR/AI matching failed: {e}')
        logger.info('使用备选方案：基于字符数计算时长')
        # 备选方案：基于字符数计算时长
        durations = []
        for line in script_lines:
            # 基础时长 + 每个字符的阅读时长
            char_count = len(line.strip())
            duration = base_duration + (char_count * chars_per_second)
            duration = max(min_duration, min(max_duration, duration))
            durations.append(duration)
        logger.info(f'备选方案计算时长: {durations}')
        return durations


def create_video_from_scenes(
    audio_paths: List[str],
    script_lines: List[str],
    image_paths: List[str],
    output_path: str,
    fps: int,
    resolution: tuple[int, int],
    subtitle_position: str = 'bottom',
    subtitle_fontsize: int = 60,
    subtitle_stroke_width: int = 6,
    subtitle_bg_color: Optional[str] = None,
    subtitle_bg_opacity: float = 0.5,
    test_mode: bool = False,
    test_duration: float = 10.0,
) -> None:
    """
    从场景创建视频

    Args:
        audio_paths: 每个场景对应的音频文件路径列表
        test_mode: 测试模式，只生成前 N 秒的视频
        test_duration: 测试模式下的视频时长（秒）
    """
    logger.info(f'开始创建视频: {output_path}')
    logger.info(f'参数: fps={fps}, resolution={resolution}, test_mode={test_mode}, test_duration={test_duration}')
    logger.debug(f'脚本数量: {len(script_lines)}, 图片数量: {len(image_paths)}, 音频数量: {len(audio_paths)}')

    if len(script_lines) != len(image_paths):
        logger.error(f'脚本和图片数量不匹配: {len(script_lines)} vs {len(image_paths)}')
        raise ValueError('Script lines and image count mismatch')
    if len(script_lines) != len(audio_paths):
        logger.error(f'脚本和音频数量不匹配: {len(script_lines)} vs {len(audio_paths)}')
        raise ValueError('Script lines and audio count mismatch')

    for audio_path in audio_paths:
        if not Path(audio_path).exists():
            logger.error(f'音频文件不存在: {audio_path}')
            raise FileNotFoundError(audio_path)
    for img in image_paths:
        if not Path(img).exists():
            raise FileNotFoundError(img)

    # 直接从音频文件获取时长
    logger.info('从音频文件获取场景时长...')
    scene_durations = []
    for audio_path in audio_paths:
        clip = AudioFileClip(audio_path)
        duration = clip.duration
        clip.close()
        scene_durations.append(duration)
    logger.info(f'场景时长: {scene_durations}')

    # 测试模式：累计时长，只保留需要的场景
    if test_mode:
        total_duration = 0.0
        included_indices = []
        for i, duration in enumerate(scene_durations):
            if total_duration + duration <= test_duration:
                included_indices.append(i)
                total_duration += duration
            else:
                break

        if not included_indices:
            included_indices = [0]  # 至少包含第一个场景

        print(f'[TEST MODE] 包含场景: {included_indices} (总时长: {total_duration:.1f}s)')
        # 截取脚本、图片路径和音频路径
        script_lines = [script_lines[i] for i in included_indices]
        image_paths = [image_paths[i] for i in included_indices]
        audio_paths = [audio_paths[i] for i in included_indices]
        scene_durations = [scene_durations[i] for i in included_indices]
    width, height = resolution
    subtitle_height = int(height * 0.12)

    if subtitle_position == 'top':
        text_position = ('center', height * 0.1)
    elif subtitle_position == 'center':
        text_position = ('center', 'center')
    else:
        bottom_margin = height * 0.18
        text_position = ('center', height - subtitle_height - bottom_margin)

    video_clips = []
    for script_text, image_path, duration in zip(script_lines, image_paths, scene_durations):
        image_clip = ImageClip(image_path, duration=duration)
        image_clip = image_clip.resized(height=height)
        if image_clip.w > width:
            image_clip = image_clip.cropped(
                x1=(image_clip.w - width) // 2,
                x2=(image_clip.w + width) // 2,
            )
        elif image_clip.w < width:
            image_clip = image_clip.with_background_color(size=(width, height), color=(0, 0, 0), opacity=1)

        effects_cfg = config.get('video_effects', {})
        if effects_cfg.get('enable_movement', False):
            image_clip = apply_ken_burns_effect(
                image_clip,
                movement_type=effects_cfg.get('movement_type', 'random'),
                zoom_ratio=effects_cfg.get('zoom_ratio', 1.08),
                pan_x_range=effects_cfg.get('pan_x_range', 30),
                pan_y_range=effects_cfg.get('pan_y_range', 30),
            )

        punctuation = '???,;:????""[]()????<>??,.?!'
        display_text = script_text.rstrip(punctuation) or script_text

        # 中文字体配置（按优先级尝试）
        font_candidates = [
            Path(__file__).parent / 'assets' / 'fonts' / 'NotoSansSC-VariableFont_wght.ttf',
            Path(__file__).parent / 'assets' / 'fonts' / 'NotoSansSC-Regular.ttf',
            Path(__file__).parent / 'assets' / 'fonts' / 'SimHei.ttf',
            Path('C:/Windows/Fonts/msyh.ttc'),  # 微软雅黑
            Path('C:/Windows/Fonts/simhei.ttf'),  # 黑体
        ]

        text_clip = None
        for font_path in font_candidates:
            if font_path.exists():
                try:
                    # 直接使用字体路径，不使用变量字体语法
                    text_clip = TextClip(
                        text=display_text,
                        font_size=subtitle_fontsize,
                        color='white',
                        font=str(font_path),
                        stroke_color='black',
                        stroke_width=subtitle_stroke_width,
                        text_align='center',
                        method='caption',
                        size=(int(width * 0.9), int(height * 0.3)),
                        margin=(20, 20),
                        bg_color=subtitle_bg_color,
                    )
                    break  # 成功创建，退出循环
                except Exception as e:
                    print(f'[WARN] 字体加载失败 {font_path.name}: {e}')
                    continue

        # 如果所有字体都失败，使用系统默认
        if text_clip is None:
            logger.warning('所有中文字体加载失败，使用系统默认字体（可能出现乱码）')
            print('[WARN] 所有中文字体加载失败，使用系统默认字体（可能出现乱码）')
            text_clip = TextClip(
                text=display_text,
                font_size=subtitle_fontsize,
                color='white',
                stroke_color='black',
                stroke_width=subtitle_stroke_width,
                text_align='center',
                method='caption',
                size=(int(width * 0.9), int(height * 0.3)),
                margin=(20, 20),
                bg_color=subtitle_bg_color,
            )

        # 应用字幕延迟（字幕整体向后延迟）
        subtitle_delay = config.get('timing', {}).get('subtitle_delay', 0.0)
        text_clip = text_clip.with_position(text_position).with_start(subtitle_delay).with_duration(duration)
        composite_clip = CompositeVideoClip([image_clip, text_clip])
        video_clips.append(composite_clip)

    logger.info(f'创建了 {len(video_clips)} 个视频片段')

    transition_duration = config.get('timing', {}).get('transition_duration', 0.8)
    clips_with_transitions = []
    current_time = 0
    for i, clip in enumerate(video_clips):
        clip_duration = clip.duration
        if i == 0:
            clip_with_transition = clip.with_effects([vfx.FadeIn(transition_duration), vfx.FadeOut(transition_duration)])
            clip_with_transition = clip_with_transition.with_start(current_time)
        elif i == len(video_clips) - 1:
            overlap_start = current_time - transition_duration
            clip_with_transition = clip.with_effects([vfx.CrossFadeIn(transition_duration)])
            clip_with_transition = clip_with_transition.with_start(overlap_start)
        else:
            overlap_start = current_time - transition_duration
            clip_with_transition = clip.with_effects([vfx.CrossFadeIn(transition_duration), vfx.FadeOut(transition_duration)])
            clip_with_transition = clip_with_transition.with_start(overlap_start)
        clips_with_transitions.append(clip_with_transition)
        current_time += clip_duration

    final_video = CompositeVideoClip(clips_with_transitions)

    # 拼接所有音频片段（手动实现）
    logger.info('拼接音频片段...')
    audio_segments = [AudioFileClip(path) for path in audio_paths]

    # 计算每个音频片段的起始时间
    current_time = 0.0
    for i, segment in enumerate(audio_segments):
        audio_segments[i] = segment.with_start(current_time)
        current_time += segment.duration

    # 创建合成音频
    final_audio = CompositeAudioClip(audio_segments)

    # 添加背景音乐（可选）
    audio_effects = config.get('audio_effects', {})
    if audio_effects.get('enable_bgm'):
        logger.info(f'添加背景音乐...')
        total_duration = current_time
        bgm_audio = create_bgm_audio(
            bgm_path=audio_effects.get('bgm_path', 'assets/audio/background_music.mp3'),
            duration=total_duration,
            volume=audio_effects.get('bgm_volume', 0.3),
            loop=audio_effects.get('bgm_loop', True),
            fadein=audio_effects.get('bgm_fadein', 2.0),
            fadeout=audio_effects.get('bgm_fadeout', 3.0),
        )
        if bgm_audio is not None:
            final_audio = CompositeAudioClip([final_audio, bgm_audio])
            logger.info('背景音乐添加成功')

    final_video = final_video.with_audio(final_audio)

    logger.info(f'开始写入视频文件: {output_path}')
    logger.info(f'视频总时长: {final_video.duration:.2f} 秒')
    final_video.write_videofile(
        output_path,
        fps=fps,
        codec='libx264',
        audio_codec='aac',
        preset='medium',
        threads=4,
    )
    logger.info(f'视频写入完成: {output_path}')

    final_video.close()
    final_audio.close()
    for segment in audio_segments:
        segment.close()
    for clip in video_clips:
        clip.close()


class VideoProjectWorkflow:
    def __init__(self, config_data: Dict[str, Any]):
        self.config = config_data
        db_path = Path(config_data.get('database', {}).get('path', 'data/projects.db'))
        self.db = ProjectDatabase(db_path)
        self.workflow_cfg = config_data.get('workflow', {})
        self.image_root = Path(self.workflow_cfg.get('image_root', 'assets/images/projects'))
        self.audio_root = Path(self.workflow_cfg.get('audio_root', 'assets/audio/generated'))
        self.video_root = Path(self.workflow_cfg.get('video_root', 'outputs'))
        for path in (self.image_root, self.audio_root, self.video_root):
            path.mkdir(parents=True, exist_ok=True)
        self.storyboard_generator = StoryboardGenerator(config_data.get('volcengine', {}))
        self.tts_client = MiniMaxSpeechClient(config_data.get('minimax_speech', {}))
        comfy_config = config_data.get('comfyui', {})
        self.comfy_client = None
        self.auto_image_default = False
        if comfy_config and comfy_config.get('base_url'):
            self.comfy_client = ComfyUIClient(comfy_config)
            self.auto_image_default = bool(comfy_config.get('enable_auto_generate', False))

    def _merge_voice(self, override: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        base = dict(self.config.get('minimax_speech', {}).get('voice_setting', {}))
        if override:
            base.update({k: v for k, v in override.items() if v is not None})
        # 确保 speed 和 vol 是整数类型（MiniMax API 要求）
        if 'speed' in base and isinstance(base['speed'], float):
            base['speed'] = int(base['speed'])
        if 'vol' in base and isinstance(base['vol'], float):
            base['vol'] = int(base['vol'])
        if 'pitch' in base and isinstance(base['pitch'], float):
            base['pitch'] = int(base['pitch'])
        return base

    def _merge_audio(self, override: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        base = dict(self.config.get('minimax_speech', {}).get('audio_setting', {}))
        if override:
            base.update({k: v for k, v in override.items() if v is not None})
        # 确保 sample_rate 和 bitrate 是整数类型（MiniMax API 要求）
        if 'sample_rate' in base and isinstance(base['sample_rate'], float):
            base['sample_rate'] = int(base['sample_rate'])
        if 'bitrate' in base and isinstance(base['bitrate'], float):
            base['bitrate'] = int(base['bitrate'])
        # 确保 channel 是整数类型
        if 'channel' in base and isinstance(base['channel'], float):
            base['channel'] = int(base['channel'])
        return base

    def get_project(self, project_id: int) -> Dict[str, Any]:
        project = self.db.get_project(project_id, include_shots=True)
        if not project:
            raise ValueError(f'Project {project_id} not found')
        return project

    def list_projects(self) -> List[Dict[str, Any]]:
        return self.db.list_projects()

    def create_project(
        self,
        *,
        theme: str,
        style: Optional[str],
        aspect_ratio: str,
        scene_count: int,
        image_style: Optional[str],
        negative_prompt: Optional[str],
        voice_setting: Optional[Dict[str, Any]],
        audio_setting: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        script_style = style or DEFAULT_STORY_TONE
        image_style_value = image_style or DEFAULT_IMAGE_STYLE
        negative_prompt_value = negative_prompt or DEFAULT_NEGATIVE_PROMPT
        scene_count = max(1, min(scene_count, 30))

        storyboard = self.storyboard_generator.generate_storyboard(
            theme=theme,
            style=script_style,
            scene_count=scene_count,
            image_style=image_style_value,
            negative_prompt_hint=negative_prompt_value,
        )

        project_config = {
            'image_style': image_style_value,
            'negative_prompt': negative_prompt_value,
            'voice_setting': self._merge_voice(voice_setting),
            'audio_setting': self._merge_audio(audio_setting),
            'storyboard_meta': {
                'title': storyboard.get('title', theme),
                'voice_tone': storyboard.get('voice_tone', script_style),
            },
        }

        project_id = self.db.create_project(
            theme=theme,
            style=script_style,
            aspect_ratio=aspect_ratio or DEFAULT_ASPECT_RATIO,
            scene_count=scene_count,
            status='draft',
            config=project_config,
        )

        image_dir = self.image_root / f'project_{project_id}'
        image_dir.mkdir(parents=True, exist_ok=True)

        shot_records: List[ShotRecord] = []
        for idx, shot in enumerate(storyboard['shots'], start=1):
            image_path = image_dir / f'scene_{idx}.png'
            shot_records.append(
                ShotRecord(
                    display_index=idx,
                    script_text=shot.get('script', '').strip(),
                    image_prompt=shot.get('image_prompt', '').strip(),
                    negative_prompt=shot.get('negative_prompt', negative_prompt_value).strip(),
                    image_path=str(image_path),
                )
            )
        self.db.replace_shots(project_id, shot_records)
        return self.get_project(project_id)


    def update_shots(self, project_id: int, shots_payload: List[Dict[str, Any]]) -> Dict[str, Any]:
        self.get_project(project_id)
        self.db.update_shots(project_id, shots_payload)
        return self.get_project(project_id)

    def generate_images_for_project(self, project_id: int, missing_only: bool = True) -> Dict[str, Any]:
        if not self.comfy_client or not self.comfy_client.can_use():
            raise ValueError('ComfyUI not configured or unavailable')
        project = self.get_project(project_id)
        targets = []
        for shot in project.get('shots', []):
            image_path = Path(shot['image_path'])
            if image_path.exists() and missing_only:
                continue
            targets.append((shot, image_path))
        if not targets:
            return project
        for shot, image_path in targets:
            prompt_text = shot.get('image_prompt') or project.get('config', {}).get('image_style', '')
            negative_text = shot.get('negative_prompt') or project.get('config', {}).get('negative_prompt', '')
            print(f"[ComfyUI] generating shot {shot['index']} -> {image_path}")
            self.comfy_client.generate_image(
                prompt=prompt_text,
                negative_prompt=negative_text,
                output_path=image_path,
            )
        return self.get_project(project_id)

    def finalize_project(
        self,
        project_id: int,
        test_mode: bool = False,
        test_duration: float = 10.0,
    ) -> Dict[str, Any]:
        """
        Finalize and render a project.

        Args:
            project_id: Project ID to render
            test_mode: If True, only generate first N seconds of video and reuse existing audio
            test_duration: Duration of test video in seconds (default: 10.0)
        """
        logger.info(f'开始渲染项目 #{project_id} (test_mode={test_mode}, test_duration={test_duration}s)')
        project = self.get_project(project_id)
        shots = project.get('shots', [])
        if not shots:
            logger.error(f'项目 #{project_id} 没有分镜')
            raise ValueError('Project has no shots')
        logger.info(f'项目分镜数量: {len(shots)}')

        image_paths = [shot['image_path'] for shot in shots]
        missing = [path for path in image_paths if not Path(path).exists()]
        if missing and self.comfy_client and self.auto_image_default:
            logger.info(f'自动生成缺失的分镜图片: {len(missing)} 个')
            print('[ComfyUI] auto-generating missing storyboard images')
            project = self.generate_images_for_project(project_id, missing_only=True)
            shots = project.get('shots', [])
            image_paths = [shot['image_path'] for shot in shots]
            missing = [path for path in image_paths if not Path(path).exists()]
        if missing:
            logger.error(f'缺少分镜图片: {missing}')
            raise FileNotFoundError('Missing storyboard images\n' + '\n'.join(missing))

        script_lines = [shot['script_text'] for shot in shots]
        project_config = project.get('config', {})
        voice_setting = self._merge_voice(project_config.get('voice_setting'))
        audio_setting = self._merge_audio(project_config.get('audio_setting'))
        extra_options = {}
        for key in ('subtitle_enable', 'aigc_watermark', 'output_format'):
            if key in audio_setting:
                extra_options[key] = audio_setting.pop(key)

        audio_ext = audio_setting.get('format', 'mp3')
        video_path = self.video_root / f'project_{project_id}.mp4'

        # 为每个分镜单独生成音频
        audio_paths = []
        shots_to_process = shots
        script_lines_to_process = script_lines
        image_paths_to_process = image_paths

        # 测试模式：只使用第一个分镜
        if test_mode:
            logger.info('[TEST MODE] 只生成第一个分镜的音频和视频')
            shots_to_process = [shots[0]]
            script_lines_to_process = [script_lines[0]]
            image_paths_to_process = [image_paths[0]]

        # 检查是否所有音频已存在（复用模式）
        all_audio_exist = True
        for idx, shot in enumerate(shots_to_process, start=1):
            shot_audio_path = self.audio_root / f'project_{project_id}_shot_{shot["index"]}.{audio_ext}'
            if not shot_audio_path.exists():
                all_audio_exist = False
                break
            audio_paths.append(str(shot_audio_path))

        # 如果音频不存在，生成新的
        if not all_audio_exist:
            logger.info(f'开始合成语音（TTS）...，共 {len(shots_to_process)} 个分镜')
            self.db.update_project(project_id, status='processing')
            try:
                for idx, (shot, script_text) in enumerate(zip(shots_to_process, script_lines_to_process), start=1):
                    shot_audio_path = self.audio_root / f'project_{project_id}_shot_{shot["index"]}.{audio_ext}'
                    logger.info(f'正在生成分镜 #{idx} (index={shot["index"]}) 的语音: {script_text[:30]}...')

                    # 使用场景特定的 voice_id（如果有），否则使用默认配置
                    shot_voice_setting = voice_setting
                    if shot.get("voice_id"):
                        shot_voice_setting = voice_setting.copy()
                        shot_voice_setting["voice_id"] = shot["voice_id"]
                        logger.info(f'  使用场景特定声音: {shot["voice_id"]}')

                    self.tts_client.synthesize(
                        text=script_text,
                        output_path=shot_audio_path,
                        voice_setting=shot_voice_setting,
                        audio_setting=audio_setting,
                        extra_options=extra_options or None,
                    )

                    # 更新数据库记录
                    self.db.update_shot_audio_path(shot['id'], str(shot_audio_path))
                    audio_paths.append(str(shot_audio_path))
                    logger.info(f'分镜 #{idx} 音频生成完成: {shot_audio_path}')
                logger.info(f'所有语音合成完成')
            except Exception:
                logger.exception(f'语音合成失败')
                self.db.update_project(project_id, status='failed')
                raise
        else:
            logger.info(f'复用已存在的音频文件')

        # 生成视频
        self.db.update_project(project_id, status='processing')
        try:
            resolution = get_resolution_from_config(project.get('aspect_ratio', DEFAULT_ASPECT_RATIO))
            logger.info(f'分辨率: {resolution}')
            create_video_from_scenes(
                audio_paths=audio_paths,
                script_lines=script_lines_to_process,
                image_paths=image_paths_to_process,
                output_path=str(video_path),
                fps=24,
                resolution=resolution,
                test_mode=test_mode,
                test_duration=test_duration,
            )
            self.db.update_project(
                project_id,
                status='rendered',
                video_path=str(video_path),
            )
            logger.info(f'项目 #{project_id} 渲染完成!')
        except Exception:
            logger.exception(f'项目 #{project_id} 渲染失败')
            self.db.update_project(project_id, status='failed')
            raise
        return self.get_project(project_id)


WORKFLOW_INSTANCE: Optional[VideoProjectWorkflow] = None


def get_workflow() -> VideoProjectWorkflow:
    global WORKFLOW_INSTANCE
    if WORKFLOW_INSTANCE is None:
        WORKFLOW_INSTANCE = VideoProjectWorkflow(config)
    return WORKFLOW_INSTANCE


class ProjectCreateRequest(BaseModel):
    theme: str
    style: Optional[str] = None
    image_style: Optional[str] = None
    negative_prompt: Optional[str] = None
    scene_count: int = Field(default=DEFAULT_SCENE_COUNT, ge=1, le=30)
    aspect_ratio: str = Field(default=DEFAULT_ASPECT_RATIO)
    voice_setting: Optional[Dict[str, Any]] = None
    audio_setting: Optional[Dict[str, Any]] = None


class ShotUpdate(BaseModel):
    id: int
    script_text: str
    image_prompt: str
    negative_prompt: Optional[str] = ''
    image_path: str


class ShotsUpdateRequest(BaseModel):
    shots: List[ShotUpdate]


app = FastAPI(title='Video Format Demo', version='0.2.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

FRONTEND_FILE = Path(__file__).parent / 'assets' / 'frontend' / 'index.html'


@app.get('/', response_class=HTMLResponse)
def frontend_page():
    if not FRONTEND_FILE.exists():
        raise HTTPException(status_code=500, detail='Missing assets/frontend/index.html')
    return HTMLResponse(FRONTEND_FILE.read_text(encoding='utf-8'))


@app.get('/api/projects')
def api_list_projects():
    workflow = get_workflow()
    return {'projects': workflow.list_projects()}


@app.get('/api/projects/{project_id}')
def api_get_project(project_id: int):
    workflow = get_workflow()
    try:
        return workflow.get_project(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post('/api/projects')
def api_create_project(payload: ProjectCreateRequest):
    workflow = get_workflow()
    try:
        return workflow.create_project(
            theme=payload.theme,
            style=payload.style,
            aspect_ratio=payload.aspect_ratio,
            scene_count=payload.scene_count,
            image_style=payload.image_style,
            negative_prompt=payload.negative_prompt,
            voice_setting=payload.voice_setting,
            audio_setting=payload.audio_setting,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.put('/api/projects/{project_id}/shots')
def api_update_shots(project_id: int, payload: ShotsUpdateRequest):
    workflow = get_workflow()
    try:
        return workflow.update_shots(project_id, [shot.dict() for shot in payload.shots])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post('/api/projects/{project_id}/confirm')
def api_confirm_project(project_id: int):
    workflow = get_workflow()
    try:
        return workflow.finalize_project(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def main():
    """CLI 主入口"""
    logger.info('=' * 50)
    logger.info('视频生成工具启动')
    logger.info('=' * 50)

    parser = argparse.ArgumentParser(description='Video generation workflow CLI')
    parser.add_argument('--theme', help='Video theme', required=False)
    parser.add_argument('--style', help='Narration tone', default=DEFAULT_STORY_TONE)
    parser.add_argument('--image-style', help='Global image style', default=DEFAULT_IMAGE_STYLE)
    parser.add_argument('--negative-prompt', help='Negative prompt', default=DEFAULT_NEGATIVE_PROMPT)
    parser.add_argument('--scene-count', type=int, default=DEFAULT_SCENE_COUNT)
    parser.add_argument('--aspect-ratio', default=DEFAULT_ASPECT_RATIO)
    parser.add_argument('--voice-id', help='MiniMax voice_id override')
    parser.add_argument('--voice-speed', type=float, help='MiniMax speech speed override')
    parser.add_argument('--auto-confirm', action='store_true', help='Auto render without prompt')
    parser.add_argument('--auto-images', action='store_true', help='Use ComfyUI to auto-generate storyboard images')
    parser.add_argument('--project-id', type=int, help='Render existing project')
    parser.add_argument('--test', action='store_true', help='Test mode: only generate first N seconds of video and reuse existing audio')
    parser.add_argument('--test-duration', type=float, default=10.0, help='Test mode video duration in seconds (default: 10.0)')
    args = parser.parse_args()

    logger.debug(f'CLI 参数: {vars(args)}')

    workflow = get_workflow()

    if args.project_id and args.theme:
        parser.error('--project-id and --theme are mutually exclusive')

    if args.project_id:
        logger.info(f'渲染现有项目 #{args.project_id}')
        project = workflow.finalize_project(
            args.project_id,
            test_mode=args.test,
            test_duration=args.test_duration,
        )
        logger.info(f"项目 #{project['id']} 渲染完成 -> {project.get('video_path')}")
        print(f"Rendered project #{project['id']} -> {project.get('video_path')}")
        return

    if not args.theme:
        parser.error('--theme is required when creating a project')

    voice_override = {}
    if args.voice_id:
        voice_override['voice_id'] = args.voice_id
    if args.voice_speed is not None:
        voice_override['speed'] = args.voice_speed

    logger.info(f'创建新项目: theme={args.theme}, scene_count={args.scene_count}')
    project = workflow.create_project(
        theme=args.theme,
        style=args.style,
        aspect_ratio=args.aspect_ratio,
        scene_count=args.scene_count,
        image_style=args.image_style,
        negative_prompt=args.negative_prompt,
        voice_setting=voice_override or None,
        audio_setting=None,
    )
    logger.info(f'项目 #{project["id"]} 创建成功')

    if args.auto_images:
        if not workflow.comfy_client or not workflow.comfy_client.can_use():
            logger.warning('ComfyUI 未配置，无法自动生成图片')
            print('[WARN] ComfyUI 未配置，无法自动生成图片。')
        else:
            logger.info('使用 ComfyUI 为所有分镜生成图片...')
            print('[ComfyUI] 正在为所有分镜生成图片...')
            project = workflow.generate_images_for_project(project['id'], missing_only=False)
            logger.info(f'图片生成完成')

    print(f"Created project #{project['id']} in draft status")
    print('Planned image paths:')
    for shot in project.get('shots', []):
        print(f" - {shot['image_path']}")
        print(f"   Prompt: {shot['image_prompt']}")
        print(f"   Negative: {shot['negative_prompt']}")

    if args.auto_confirm:
        confirm = True
    else:
        confirm = input('Proceed with rendering? (y/N): ').strip().lower() == 'y'

    if not confirm:
        logger.info('用户取消渲染，退出')
        print(f"Run python main.py --project-id {project['id']} after you have assets ready.")
        return

    # Auto-generate missing images before rendering (if ComfyUI is configured)
    if workflow.comfy_client and workflow.comfy_client.can_use():
        logger.info('检查并生成缺失的分镜图片...')
        print('[ComfyUI] 正在检查并生成缺失的分镜图片...')
        project = workflow.generate_images_for_project(project['id'], missing_only=True)

    logger.info(f'开始渲染项目 #{project["id"]}')
    final_project = workflow.finalize_project(project['id'])
    logger.info(f'项目渲染完成! 音频: {final_project.get("audio_path")}, 视频: {final_project.get("video_path")}')
    logger.info('=' * 50)
    print(f"Completed! Audio: {final_project.get('audio_path')} Video: {final_project.get('video_path')}")


if __name__ == '__main__':
    main()
