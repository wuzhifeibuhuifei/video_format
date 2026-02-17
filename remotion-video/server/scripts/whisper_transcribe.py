#!/usr/bin/env python3
"""
使用 faster-whisper 生成字幕时间戳
免费的本地 Whisper 实现
"""

import sys
import json
from faster_whisper import WhisperModel

def transcribe_audio(audio_path, model_size="base", language="zh"):
    """
    使用 faster-whisper 识别音频并返回时间戳
    
    Args:
        audio_path: 音频文件路径
        model_size: 模型大小 (tiny, base, small, medium, large-v3)
        language: 语言代码
    
    Returns:
        JSON 格式的识别结果
    """
    try:
        # 初始化模型 (使用 CPU 或 GPU)
        # device="cuda" 如果有 NVIDIA GPU
        # device="cpu" 如果只有 CPU
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        
        print(f"[Whisper] 正在识别音频: {audio_path}", file=sys.stderr)
        print(f"[Whisper] 模型: {model_size}, 语言: {language}", file=sys.stderr)
        
        # 识别音频,启用单词级时间戳
        segments, info = model.transcribe(
            audio_path,
            language=language,
            word_timestamps=True,
            vad_filter=True,  # 语音活动检测,提高准确性
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        print(f"[Whisper] 检测到语言: {info.language}, 概率: {info.language_probability:.2f}", file=sys.stderr)
        
        # 收集所有单词和段落
        all_words = []
        all_segments = []
        
        for segment in segments:
            # 段落级时间戳
            all_segments.append({
                "text": segment.text.strip(),
                "start": segment.start,
                "end": segment.end
            })
            
            # 单词级时间戳
            if segment.words:
                for word in segment.words:
                    all_words.append({
                        "word": word.word.strip(),
                        "start": word.start,
                        "end": word.end
                    })
        
        # 构建完整文本
        full_text = " ".join([seg["text"] for seg in all_segments])
        
        result = {
            "text": full_text,
            "words": all_words,
            "segments": all_segments,
            "language": info.language
        }
        
        print(f"[Whisper] 识别完成: {len(all_words)} 个单词, {len(all_segments)} 个段落", file=sys.stderr)
        
        # 输出 JSON 到 stdout
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "text": "",
            "words": [],
            "segments": []
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python whisper_transcribe.py <audio_path> [model_size] [language]", file=sys.stderr)
        print("示例: python whisper_transcribe.py audio.mp3 base zh", file=sys.stderr)
        sys.exit(1)
    
    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"
    language = sys.argv[3] if len(sys.argv) > 3 else "zh"
    
    transcribe_audio(audio_path, model_size, language)
