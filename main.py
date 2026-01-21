
# Video generation workflow combining ASR alignment, storyboard prompts, and MiniMax TTS.

import argparse
import json
import os
import random
import re
import http.client
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
    converter = opencc.OpenCC('t2s')
    audio_filename = Path(audio_path).stem
    subtitles_dir = Path(__file__).parent / 'assets' / 'subtitles'
    subtitles_dir.mkdir(parents=True, exist_ok=True)
    json_file_path = subtitles_dir / f'{audio_filename}_detail.json'

    if json_file_path.exists() and not force_refresh:
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
                return segments
        except Exception:
            pass

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

    ext = os.path.splitext(audio_path)[1].upper().lstrip('.')
    supported = {'MP4', 'AAC', 'MP3', 'OPUS', 'WAV'}
    if ext not in supported:
        raise ValueError(f'Unsupported audio format: {ext}')

    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    headers = {
        'Content-Type': f'multipart/form-data; boundary={boundary}',
        'X-NLS-Token': token,
    }

    file_bytes = Path(audio_path).read_bytes()
    multipart_head = (
        f"--{boundary}\r\n"
        f"Content-Disposition: form-data; name=\"appkey\"\r\n\r\n{appkey}\r\n"
        f"--{boundary}\r\n"
        f"Content-Disposition: form-data; name=\"audio\"; filename=\"audio.{ext.lower()}\"\r\n"
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode('utf-8')
    multipart_tail = f"\r\n--{boundary}--\r\n".encode('utf-8')
    body = multipart_head + file_bytes + multipart_tail
    conn = http.client.HTTPSConnection(host)
    conn.request('POST', '/stream/v1/FlashRecognizer', body=body, headers=headers)
    response = conn.getresponse()
    data = response.read().decode('utf-8')
    conn.close()
    result = json.loads(data)

    if result.get('status') != 20000000:
        raise ValueError(f"ASR failed: {result.get('message')}")

    with open(json_file_path, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)

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
    return segments


def find_timestamps_with_ai(script_lines: List[str], word_segments: List[dict]) -> List[dict]:
    timestamp_flow = ''.join(
        f"[{seg['start']:.2f}s-{seg['end']:.2f}s] {seg['text']}\\n" for seg in word_segments
    )
    script_text = '\\n'.join(f"{idx + 1}. {line}" for idx, line in enumerate(script_lines))

    prompt = (
        "You align narration sentences with token-level timestamps.\\n\\n"
        f"Word-level stream:\\n{timestamp_flow}\\n\\n"
        f"Storyboard:\\n{script_text}\\n\\n"
        "Return JSON array with fields id, text, start, end, duration."
    )

    volc_cfg = config.get('volcengine', {})
    api_url = volc_cfg.get('api_url')
    api_key = volc_cfg.get('api_key')
    model = volc_cfg.get('model')
    if not api_url or not api_key or not model:
        raise ValueError('Volcengine config is missing')

    headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
    payload = {
        'model': model,
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt}]}],
        'temperature': 0.3,
    }

    with httpx.Client(timeout=120.0) as client:
        resp = client.post(api_url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
    if isinstance(content, list):
        content = '\\n'.join(part.get('text', '') for part in content if isinstance(part, dict))
    content = content.strip()
    if content.startswith('```'):
        content = content.strip('`\\n')

    return json.loads(content)


def calculate_scene_durations(audio_path: str, script_lines: List[str]) -> List[float]:
    word_segments = get_transcript_with_timestamps(audio_path)
    timestamp_results = find_timestamps_with_ai(script_lines, word_segments)
    timing_config = config.get('timing', {})
    min_duration = timing_config.get('min_duration', 2.0)
    max_duration = timing_config.get('max_duration', 15.0)

    durations = []
    for result in timestamp_results:
        duration = max(min_duration, min(max_duration, result.get('duration', 0)))
        durations.append(duration)
    return durations


def create_video_from_scenes(
    audio_path: str,
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
) -> None:
    if len(script_lines) != len(image_paths):
        raise ValueError('Script lines and image count mismatch')
    if not Path(audio_path).exists():
        raise FileNotFoundError(audio_path)
    for img in image_paths:
        if not Path(img).exists():
            raise FileNotFoundError(img)

    scene_durations = calculate_scene_durations(audio_path, script_lines)
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

        font_path = Path(__file__).parent / 'assets' / 'fonts' / 'NotoSansSC-VariableFont_wght.ttf'
        text_clip = None
        if font_path.exists():
            try:
                text_clip = TextClip(
                    text=display_text,
                    font_size=subtitle_fontsize,
                    color='white',
                    font=f"{str(font_path)}#wght@700",
                    stroke_color='black',
                    stroke_width=subtitle_stroke_width,
                    text_align='center',
                    method='caption',
                    size=(int(width * 0.9), int(height * 0.3)),
                    margin=(20, 20),
                    bg_color=subtitle_bg_color,
                )
            except Exception:
                pass
        if text_clip is None:
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

        text_clip = text_clip.with_position(text_position).with_duration(duration)
        composite_clip = CompositeVideoClip([image_clip, text_clip])
        video_clips.append(composite_clip)

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
    audio_clip = AudioFileClip(audio_path)

    audio_effects = config.get('audio_effects', {})
    if audio_effects.get('enable_bgm'):
        bgm_audio = create_bgm_audio(
            bgm_path=audio_effects.get('bgm_path', 'assets/audio/background_music.mp3'),
            duration=audio_clip.duration,
            volume=audio_effects.get('bgm_volume', 0.3),
            loop=audio_effects.get('bgm_loop', True),
            fadein=audio_effects.get('bgm_fadein', 2.0),
            fadeout=audio_effects.get('bgm_fadeout', 3.0),
        )
        if bgm_audio is not None:
            audio_clip = CompositeAudioClip([audio_clip, bgm_audio])

    final_video = final_video.with_audio(audio_clip)
    final_video.write_videofile(
        output_path,
        fps=fps,
        codec='libx264',
        audio_codec='aac',
        preset='medium',
        threads=4,
    )
    final_video.close()
    audio_clip.close()
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
        return base

    def _merge_audio(self, override: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        base = dict(self.config.get('minimax_speech', {}).get('audio_setting', {}))
        if override:
            base.update({k: v for k, v in override.items() if v is not None})
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

    def finalize_project(self, project_id: int) -> Dict[str, Any]:
        project = self.get_project(project_id)
        shots = project.get('shots', [])
        if not shots:
            raise ValueError('Project has no shots')

        image_paths = [shot['image_path'] for shot in shots]
        missing = [path for path in image_paths if not Path(path).exists()]
        if missing and self.comfy_client and self.auto_image_default:
            print('[ComfyUI] auto-generating missing storyboard images')
            project = self.generate_images_for_project(project_id, missing_only=True)
            shots = project.get('shots', [])
            image_paths = [shot['image_path'] for shot in shots]
            missing = [path for path in image_paths if not Path(path).exists()]
        if missing:
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
        audio_path = self.audio_root / f'project_{project_id}.{audio_ext}'
        video_path = self.video_root / f'project_{project_id}.mp4'

        self.db.update_project(project_id, status='processing')
        try:
            narrative_text = '\n'.join(script_lines)
            self.tts_client.synthesize(
                text=narrative_text,
                output_path=audio_path,
                voice_setting=voice_setting,
                audio_setting=audio_setting,
                extra_options=extra_options or None,
            )
            resolution = get_resolution_from_config(project.get('aspect_ratio', DEFAULT_ASPECT_RATIO))
            create_video_from_scenes(
                audio_path=str(audio_path),
                script_lines=script_lines,
                image_paths=image_paths,
                output_path=str(video_path),
                fps=24,
                resolution=resolution,
            )
            self.db.update_project(
                project_id,
                status='rendered',
                audio_path=str(audio_path),
                video_path=str(video_path),
            )
        except Exception:
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
    args = parser.parse_args()

    workflow = get_workflow()

    if args.project_id and args.theme:
        parser.error('--project-id and --theme are mutually exclusive')

    if args.project_id:
        project = workflow.finalize_project(args.project_id)
        print(f"Rendered project #{project['id']} -> {project.get('video_path')}")
        return

    if not args.theme:
        parser.error('--theme is required when creating a project')

    voice_override = {}
    if args.voice_id:
        voice_override['voice_id'] = args.voice_id
    if args.voice_speed is not None:
        voice_override['speed'] = args.voice_speed

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

    if args.auto_images:
        if not workflow.comfy_client or not workflow.comfy_client.can_use():
            print('[WARN] ComfyUI 未配置，无法自动生成图片。')
        else:
            print('[ComfyUI] 正在为所有分镜生成图片...')
            project = workflow.generate_images_for_project(project['id'], missing_only=False)

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
        print(f"Run python main.py --project-id {project['id']} after you have assets ready.")
        return

    final_project = workflow.finalize_project(project['id'])
    print(f"Completed! Audio: {final_project.get('audio_path')} Video: {final_project.get('video_path')}")


if __name__ == '__main__':
    main()
