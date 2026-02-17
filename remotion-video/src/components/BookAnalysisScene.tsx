import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
  Sequence,
  useVideoConfig,
} from 'remotion';
import type { Shot, KenBurnsType, SubtitlePosition } from '../types';
import { KenBurnsImage } from './KenBurnsImage';
import { Subtitle } from './Subtitle';
import { HighlightText } from './HighlightText';


type BookAnalysisSceneProps = {
  shot: Shot;
  globalFrameOffset: number;
  backgroundUrl?: string;           // 可选：仅分段独立背景时传入
  backgroundType?: 'image' | 'video';
  enableKenBurns: boolean;
  kenBurnsType: KenBurnsType;
  zoomRatio: number;
  panRange: number;
  enableSubtitle: boolean;
  subtitlePosition: SubtitlePosition;
  subtitleFontSize: number;
  subtitleStrokeWidth: number;
  subtitleColor: string;
  highlightSfxUrl?: string;
};

export const BookAnalysisScene: React.FC<BookAnalysisSceneProps> = ({
  shot,
  globalFrameOffset,
  backgroundUrl,
  backgroundType,
  enableKenBurns,
  kenBurnsType,
  zoomRatio,
  panRange,
  enableSubtitle,
  subtitlePosition,
  subtitleFontSize,
  subtitleStrokeWidth,
  subtitleColor,
  highlightSfxUrl,
}) => {
  const { width, height } = useVideoConfig();
  const hasScriptText = !!(shot.scriptText && shot.scriptText.trim());

  // 是否有分段独立背景
  const hasBackground = !!backgroundUrl;

  // 判断是否为纯背景段落（无文字）
  const isBackgroundOnly = !hasScriptText;

  // 背景视频处理逻辑（仅分段独立背景时生效）
  const shouldLoopBackgroundVideo =
    hasBackground &&
    backgroundType === 'video' &&
    !!shot.backgroundVideoDurationInFrames &&
    shot.durationInFrames > shot.backgroundVideoDurationInFrames;

  // 背景视频时长
  const bgVideoDuration = shot.backgroundVideoDurationInFrames || shot.durationInFrames;

  // 无文字时使用背景视频作为主要画面，需要播放原音
  const shouldPlayBgAudio = isBackgroundOnly && backgroundType === 'video' && hasBackground;

  // 调试日志：检查 shot 数据
  console.log(`[BookAnalysisScene] Shot ${shot.index}:`, {
    hasScriptText,
    scriptTextLength: shot.scriptText?.length || 0,
    hasSubtitleTimestamps: !!shot.subtitleTimestamps,
    timestampCount: shot.subtitleTimestamps?.length || 0,
    durationInFrames: shot.durationInFrames,
    globalFrameOffset,
  });

  return (
    <AbsoluteFill>
      {/* 分段独立背景层：仅当有分段背景时渲染，覆盖全局背景 */}
      {hasBackground && backgroundType === 'video' ? (
        shouldLoopBackgroundVideo ? (
          <Loop durationInFrames={bgVideoDuration}>
            <OffthreadVideo
              src={backgroundUrl}
              style={{ width, height, objectFit: 'cover' }}
              muted={!shouldPlayBgAudio}
            />
          </Loop>
        ) : (
          <Sequence from={0} durationInFrames={shot.durationInFrames}>
            <OffthreadVideo
              src={backgroundUrl}
              style={{ width, height, objectFit: 'cover' }}
              muted={!shouldPlayBgAudio}
            />
          </Sequence>
        )
      ) : hasBackground && backgroundType === 'image' ? (
        <KenBurnsImage
          src={backgroundUrl}
          type={enableKenBurns ? kenBurnsType : 'zoom_in'}
          zoomRatio={enableKenBurns ? zoomRatio : 1}
          panRange={panRange}
        />
      ) : null}
      {/* 无分段背景时此处透明，全局背景从底层透出 */}

      {/* 字幕（仅在有文字时显示） */}
      {enableSubtitle && hasScriptText && (
        <Subtitle
          text={shot.scriptText!}
          durationInFrames={shot.durationInFrames}
          globalFrameOffset={globalFrameOffset}
          position={subtitlePosition}
          fontSize={subtitleFontSize}
          strokeWidth={subtitleStrokeWidth}
          color={subtitleColor}
          subtitleTimestamps={shot.subtitleTimestamps}
        />
      )}

      {/* 重点标注文字（弹出动画 + 音效） */}
      {shot.highlightText && hasScriptText && (
        <HighlightText
          text={shot.highlightText}
          scriptText={shot.scriptText!}
          durationInFrames={shot.durationInFrames}
          globalFrameOffset={globalFrameOffset}
          sfxUrl={shot.highlightSfxUrl || highlightSfxUrl}
        />
      )}

      {/* 语音音频（如果有） */}
      {shot.audioUrl && <Audio src={shot.audioUrl} />}
    </AbsoluteFill>
  );
};
