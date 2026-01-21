# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Python video generation system that creates MP4 videos through an automated pipeline:
1. **Storyboard generation** via LLM (Volcengine/DeepSeek) - creates narration scripts and image prompts
2. **Image generation** via ComfyUI HTTP API or manual placement
3. **TTS audio** via MiniMax Speech API
4. **ASR alignment** via Aliyun ASR for word-level timestamps
5. **AI semantic matching** to align scene scripts with audio timing
6. **Video composition** via MoviePy with effects (Ken Burns, BGM, subtitles)

The system supports both **CLI** and **Web UI** (FastAPI) interfaces, with **SQLite** persistence for project/shot management.

## Architecture

### Entry Points

**[main.py](main.py)** - Dual entry point: CLI + FastAPI server
- `main()` - CLI interface with argparse
- FastAPI app (`app`) with REST API endpoints
- `VideoProjectWorkflow` class - orchestrates the full pipeline

### Core Components

| File | Purpose |
|------|---------|
| [main.py](main.py) | Video composition pipeline (ASR, AI matching, MoviePy), CLI, FastAPI server |
| [database.py](database.py) | `ProjectDatabase` class - SQLite persistence for projects/shots |
| [generation.py](generation.py) | `StoryboardGenerator` class - LLM-powered storyboard generation |
| [minimax_speech.py](minimax_speech.py) | `MiniMaxSpeechClient` class - TTS audio generation |
| [comfyui_client.py](comfyui_client.py) | `ComfyUIClient` class - Image generation via ComfyUI HTTP API |
| [test_timing.py](test_timing.py) | ASR/timing testing tool with rule-based fallback matching |

### VideoProjectWorkflow Pipeline

```python
# main.py:459-650
class VideoProjectWorkflow:
    create_project()        # Generate storyboard via LLM, save to SQLite
    update_shots()          # Edit shot scripts/prompts
    generate_images_for_project()  # Batch generate images via ComfyUI
    finalize_project()      # TTS + ASR + video rendering
```

### Data Flow

```
User Input (theme, style, scene count)
        ↓
StoryboardGenerator (Volcengine LLM)
→ Scripts + Image Prompts → SQLite Database
        ↓
[Optional] ComfyUIClient → Generate Images
        ↓
User Confirmation (CLI or Web UI)
        ↓
MiniMaxSpeechClient → TTS Audio Generation
        ↓
Aliyun ASR → Word-level Timestamps (cached)
        ↓
find_timestamps_with_ai() → AI Semantic Matching
        ↓
calculate_scene_durations() → Scene Timing
        ↓
create_video_from_scenes() → MoviePy Composition
→ MP4 Output (with BGM, effects, subtitles)
```

### Configuration

**[config.toml](config.toml)** stores all external API credentials and settings:

| Section | Purpose |
|---------|---------|
| `[volcengine]` | LLM API for storyboard generation + timing matching (DeepSeek-V3) |
| `[aliyun_asr]` | Aliyun speech recognition (appkey, token, region) |
| `[minimax_speech]` | TTS API (URL, key, model, voice/audio settings) |
| `[video]` | Aspect ratio (16:9, 9:16, 4:3, 1:1) |
| `[timing]` | Duration constraints (min/max duration, transition duration) |
| `[video_effects]` | Ken Burns effect (enable, zoom, pan, movement type) |
| `[audio_effects]` | BGM settings (enable, path, volume, fade in/out) |
| `[workflow]` | Defaults (scene count, image style, paths) |
| `[database]` | SQLite database path |
| `[comfyui]` | Local ComfyUI server config (base_url, model, dimensions, auto-generate flag) |

### Asset Structure

```
assets/
├── audio/
│   ├── background_music.MP3
│   └── generated/          # TTS output: project_{id}.mp3
├── images/
│   └── projects/           # Per-project image directories
│       └── project_{id}/   # scene_1.png, scene_2.png, ...
├── fonts/
│   └── NotoSansSC-VariableFont_wght.ttf
├── frontend/
│   └── index.html          # Web UI
└── subtitles/              # Cached ASR results: {audio_name}_detail.json

data/
└── projects.db             # SQLite database

outputs/                    # Final rendered videos: project_{id}.mp4
```

## Development Commands

### Installation (using uv)
```bash
uv sync
```

### CLI Usage

```bash
# Create new project (interactive confirmation)
python main.py --theme "城市微光" --style "温暖治愈" --scene-count 8

# Auto-confirm and render immediately
python main.py --theme "城市微光" --auto-confirm

# Auto-generate images with ComfyUI
python main.py --theme "城市微光" --auto-images

# Render existing project
python main.py --project-id <id>

# Full options
python main.py --theme "<topic>" \
               --style "<tone>" \
               --image-style "<style>" \
               --negative-prompt "<prompt>" \
               --scene-count 8 \
               --aspect-ratio "16:9" \
               --voice-id "male-qn-qingse" \
               --voice-speed 1.0 \
               --auto-confirm \
               --auto-images
```

### Web Server

```bash
uvicorn main:app --reload --port 8000
```

Then visit http://localhost:8000/

### Test Timing Calculation

```bash
# Rule-based matching
python test_timing.py

# AI semantic matching
python test_timing.py --ai-match
# or
python test_timing.py -a
```

### Force Refresh ASR Cache

In [main.py](main.py), call `get_transcript_with_timestamps(audio_path, force_refresh=True)` to bypass cached subtitles.

## Key Implementation Details

### Chinese Text Handling
- ASR results: Traditional to Simplified via `opencc.OpenCC('t2s')`
- Subtitles: Uses Noto Sans SC font (`assets/fonts/NotoSansSC-VariableFont_wght.ttf`) with fallback to system fonts

### ASR Timestamp Caching
- Cache location: `assets/subtitles/{audio_name}_detail.json`
- Stores raw Aliyun response with word-level timestamps
- Checked before API calls to save time/money

### AI Prompt Structure (timing alignment)
The semantic matching prompt in [main.py](main.py:264-269) follows a specific structure:
1. Role definition (audio alignment engine)
2. Input data format (timestamps + scripts)
3. Constraints & Logic (matching rules)
4. Output format (JSON array with id, text, start, end, duration)
5. Data content (actual timestamp flow + script lines)

### Duration Constraints
From config.toml `[timing]` section:
- `min_duration` - Minimum scene duration (default: 2.0s)
- `max_duration` - Maximum scene duration (default: 15.0s)
- `transition_duration` - Fade/crossfade duration (default: 0.8s)
- Applied after AI matching in `calculate_scene_durations()`

### Video Effects
**Ken Burns Effect** ([main.py:100-158](main.py#L100-L158)):
- `movement_type`: "random", "zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"
- `zoom_ratio`: 1.08 = 8% zoom (TikTok recommended: 1.12-1.18)
- `pan_x_range`, `pan_y_range`: Pixel movement (TikTok recommended: 50-80px)
- Enabled via `video_effects.enable_movement` in config.toml

### Resolution Handling
`get_resolution_from_config()` in [main.py:47-54](main.py#L47-L54):
- 16:9 → (1920, 1080)
- 9:16 → (1080, 1920)
- 4:3 → (1440, 1080)
- 1:1 → (1080, 1080)

### FastAPI Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Web UI |
| `/api/projects` | GET | List projects |
| `/api/projects/{id}` | GET | Get project details |
| `/api/projects` | POST | Create new project |
| `/api/projects/{id}/shots` | PUT | Update shots |
| `/api/projects/{id}/confirm` | POST | Finalize/render project |

## Common Modifications

| Task | Location |
|------|----------|
| Add/edit scene scripts | CLI: `--project-id` to rerender; Web UI: edit in table |
| Change output resolution | Modify `aspect_ratio` or `get_resolution_from_config()` |
| Adjust subtitle styling | `create_video_from_scenes()` parameters: `subtitle_position`, `subtitle_fontsize`, `subtitle_color`, `subtitle_stroke_width` |
| Switch LLM provider | Update `api_url`, `api_key`, `model` in config.toml `[volcengine]` |
| Enable/disable video effects | Set `enable_movement` in config.toml `[video_effects]` |
| Configure BGM | Set `enable_bgm`, `bgm_path`, `bgm_volume` in `[audio_effects]` |
| Auto-generate images | Set `enable_auto_generate = true` in `[comfyui]` or use `--auto-images` CLI flag |

## Rules

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

For video compositing using moviepy, please refer to the library zulko.github.io/moviepy for API and documentation.
