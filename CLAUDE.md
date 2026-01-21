# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Python video composition tool that automatically generates MP4 videos from:
- Narration audio files
- Scene-by-scene scripts (分镜脚本)
- Scene images (one per script line)

The core innovation is using **Aliyun ASR (Automatic Speech Recognition)** to extract word-level timestamps from audio, then using **AI semantic matching** to align scene scripts with the actual audio timing.

## Architecture

### Main Components

**[main.py](main.py)** - Primary video generation pipeline
- `get_transcript_with_timestamps()` - Extracts word-level timestamps from audio using Aliyun ASR API, with caching and Traditional-to-Simplified Chinese conversion
- `find_timestamps_with_ai()` - Uses LLM API (Volcengine/DeepSeek) to semantically match scene scripts to word timestamps
- `calculate_scene_durations()` - Combines ASR + AI matching to compute scene durations
- `create_video_from_scenes()` - Main video composition function using MoviePy

**[test_timing.py](test_timing.py)** - Testing/timing validation tool
- Similar ASR and AI matching functions
- Includes rule-based fallback matching (`find_script_line_timestamps()`)
- Detailed logging with timestamps
- Command-line interface: `python test_timing.py [--ai-match | -a]`

### Data Flow

```
Audio File → Aliyun ASR → Word-level timestamps (cached) → AI semantic matching → Scene durations → MoviePy composition → MP4
```

### Configuration

**[config.toml](config.toml)** stores all external API credentials:
- `[volcengine]` - LLM API for semantic matching (DeepSeek-V3 model)
- `[aliyun_asr]` - Aliyun speech recognition credentials
- `[timing]` - Duration constraints (min/max duration per scene)

**Important**: API keys are stored in config.toml. When modifying code that uses these APIs, check that config loading is handled correctly.

### Asset Structure

```
assets/
├── audio/          # Narration audio files (default: narration.mp3)
├── images/         # Scene images (scene_1.png, scene_2.png, ...)
└── subtitles/      # Cached ASR results (auto-generated, {audio_name}_detail.json)
```

## Development Commands

### Installation (using uv)
```bash
uv sync
```

### Run main video generation
```bash
python main.py
```

### Test timing calculation
```bash
# Using rule-based matching
python test_timing.py

# Using AI semantic matching
python test_timing.py --ai-match
# or
python test_timing.py -a
```

### Force refresh ASR cache
In [main.py](main.py), call `get_transcript_with_timestamps(audio_path, force_refresh=True)` to bypass cached subtitles.

## Key Implementation Details

### Chinese Text Handling
- All ASR results are converted from Traditional to Simplified Chinese using `opencc.OpenCC('t2s')`
- MoviePy TextClip uses "SimHei" (黑体) font as primary, with "Microsoft-YaHei" fallback

### ASR Timestamp Caching
- Results are cached to `assets/subtitles/{audio_filename}_detail.json`
- Cache is checked before making API calls (saves time/money)
- Cache files include raw Aliyun response format

### AI Prompt Structure
The semantic matching prompt in [main.py](main.py:239-285) and [test_timing.py](test_timing.py:382-428) follows a specific structure:
1. Role definition (audio alignment engine)
2. Input data format (timestamps + scripts)
3. Constraints & Logic (matching rules, edge cases)
4. Output format (JSON array with id, text, start, end, duration)
5. Data content (actual timestamp flow and script lines)

### Duration Constraints
From config.toml `[timing]` section:
- `min_duration` - Minimum scene duration (default: 2.0s)
- `max_duration` - Maximum scene duration (default: 15.0s)
- Applied after AI matching in `calculate_scene_durations()`

## Common Modifications

### Adding new scene scripts
Edit the `script_lines` list in `main()` function ([main.py:543-555](main.py#L543-L555)). Ensure corresponding images exist in `assets/images/`.

### Changing output resolution
Modify the `resolution` parameter in `create_video_from_scenes()` calls. Default is `(1920, 1080)`. Image clipping logic assumes height-based scaling.

### Adjusting subtitle styling
Subtitle parameters in `create_video_from_scenes()`:
- `subtitle_position` - "top", "center", or "bottom"
- `subtitle_fontsize` - Default 50
- `subtitle_color`, `subtitle_stroke_color`, `subtitle_stroke_width`

### Switching LLM provider
The code uses Volcengine's API with DeepSeek-V3 model. To switch:
1. Update `api_url` and `api_key` in config.toml `[volcengine]` section
2. Adjust the `model` field if needed
3. The payload format follows OpenAI-compatible chat completions API

### Rules
Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

For video compositing using moviepy, please refer to the library zulko.github.io/moviepy for API and documentation.
