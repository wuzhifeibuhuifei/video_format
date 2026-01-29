import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo } from 'remotion';
import type { Shot, KenBurnsType, SubtitlePosition } from '../types';
import { KenBurnsImage } from './KenBurnsImage';
import { Subtitle } from './Subtitle';

type SceneProps = {
  shot: Shot;
  enableKenBurns: boolean;
  kenBurnsType: KenBurnsType;
  zoomRatio: number;
  panRange: number;
  enableSubtitle: boolean;
  subtitlePosition: SubtitlePosition;
  subtitleFontSize: number;
  subtitleStrokeWidth: number;
};

export const Scene: React.FC<SceneProps> = ({
  shot,
  enableKenBurns,
  kenBurnsType,
  zoomRatio,
  panRange,
  enableSubtitle,
  subtitlePosition,
  subtitleFontSize,
  subtitleStrokeWidth,
}) => {
  // 判断是否有视频
  const hasVideo = !!shot.videoUrl;

  return (
    <AbsoluteFill>
      {/* 背景内容：有视频显示视频，无视频显示图片 */}
      {hasVideo ? (
        <OffthreadVideo
          src={shot.videoUrl!}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          muted
          volume={0}
          pauseWhenBuffering={false}
        />
      ) : (
        <KenBurnsImage
          src={shot.imageUrl}
          type={enableKenBurns ? kenBurnsType : 'zoom_in'}
          zoomRatio={enableKenBurns ? zoomRatio : 1}
          panRange={panRange}
        />
      )}

      {/* 字幕 */}
      {enableSubtitle && (
        <Subtitle
          text={shot.scriptText}
          position={subtitlePosition}
          fontSize={subtitleFontSize}
          strokeWidth={subtitleStrokeWidth}
        />
      )}

      {/* 场景音频 */}
      {shot.audioUrl && <Audio src={shot.audioUrl} />}
    </AbsoluteFill>
  );
};
